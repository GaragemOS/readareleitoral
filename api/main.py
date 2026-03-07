
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import duckdb
import json
from pathlib import Path
from functools import lru_cache
from typing import Optional, Literal

app = FastAPI()




# ── Arquivos Parquet ──────────────────────────────────────────────────────────
def conn():
    c = duckdb.connect()
    c.execute("INSTALL httpfs; LOAD httpfs;")
    return c

parquet_files = {
    2018: "https://suthuhautxmskhdwcdvv.supabase.co/storage/v1/object/public/eleicoes/eleicoes_ba_2018_1turno.parquet",
    2022: "https://suthuhautxmskhdwcdvv.supabase.co/storage/v1/object/public/eleicoes/eleicoes_ba_2022_1turno.parquet",
}

def get_parquet(ano: int) -> str:
    path = parquet_files.get(ano)
    if not path:
        raise HTTPException(status_code=400, detail=f"Ano inválido: {ano}. Use {list(parquet_files.keys())}.")
    return path


# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # ← MUDE ISSO
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helper WHERE ──────────────────────────────────────────────────────────────
def build_where(**kwargs) -> tuple[str, dict]:
    clauses = []
    params = {}

    if kwargs.get("numero") is not None:
        clauses.append("NR_VOTAVEL = $numero")
        params["numero"] = kwargs["numero"]

    if kwargs.get("cargo"):
        clauses.append("UPPER(DS_CARGO_PERGUNTA) = UPPER($cargo)")
        params["cargo"] = kwargs["cargo"].strip()

    if kwargs.get("uf"):
        clauses.append("UPPER(SG_UF) = UPPER($uf)")
        params["uf"] = kwargs["uf"].strip()

    if kwargs.get("municipio"):
        clauses.append("UPPER(NM_MUNICIPIO) = UPPER($municipio)")
        params["municipio"] = kwargs["municipio"].strip()

    if kwargs.get("nome"):
        clauses.append("UPPER(NM_VOTAVEL) LIKE $nome")
        params["nome"] = f"%{kwargs['nome'].strip().upper()}%"

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params

def run(sql: str, params: dict = {}):
    with conn() as c:
        rel = c.execute(sql, params) if params else c.execute(sql)
        cols = [d[0] for d in rel.description]
        return [dict(zip(cols, row)) for row in rel.fetchall()]

def run_one(sql: str, params: dict = {}):
    with conn() as c:
        rel = c.execute(sql, params) if params else c.execute(sql)
        cols = [d[0] for d in rel.description]
        row = rel.fetchone()
        return dict(zip(cols, row)) if row else None


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/debug/cargos")
def listar_cargos(ano: int):
    f = get_parquet(ano)
    rows = run(f"SELECT DISTINCT DS_CARGO_PERGUNTA FROM read_parquet('{f}') ORDER BY DS_CARGO_PERGUNTA")
    return [r["DS_CARGO_PERGUNTA"] for r in rows]


@app.get("/candidatos/lista")
def listar_candidatos(ano: int, cargo: str, uf: Optional[str] = None):
    f = get_parquet(ano)
    where, params = build_where(cargo=cargo, uf=uf)

    candidatos = run(f"""
        SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome,
               SG_PARTIDO as partido, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NR_VOTAVEL, NM_VOTAVEL, SG_PARTIDO
        ORDER BY total_votos DESC
    """, params)

    if not candidatos:
        raise HTTPException(status_code=404, detail="Nenhum candidato encontrado")
    return candidatos


@app.get("/candidatos/busca")
def buscar_candidatos(ano: int, nome: str, uf: Optional[str] = None):
    f = get_parquet(ano)
    where, params = build_where(nome=nome, uf=uf)

    return run(f"""
        SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome,
               DS_CARGO_PERGUNTA as cargo,
               SG_PARTIDO as partido, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NR_VOTAVEL, NM_VOTAVEL, DS_CARGO_PERGUNTA, SG_PARTIDO
        ORDER BY total_votos DESC
        LIMIT 20
    """, params)


@app.get("/candidato")
def get_candidato(ano: int, numero: int, cargo: str, uf: Optional[str] = None):
    f = get_parquet(ano)
    where, params = build_where(numero=numero, cargo=cargo, uf=uf)

    result = run_one(f"""
        SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome,
               DS_CARGO_PERGUNTA as cargo,
               SG_PARTIDO as partido, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NR_VOTAVEL, NM_VOTAVEL, DS_CARGO_PERGUNTA, SG_PARTIDO
    """, params)

    if not result:
        raise HTTPException(status_code=404, detail="Candidato não encontrado")

    por_municipio = run(f"""
        SELECT NM_MUNICIPIO, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NM_MUNICIPIO
        ORDER BY total_votos DESC
    """, params)

    return {**result, "por_municipio": por_municipio}


@app.get("/candidato/municipios")
def votos_por_municipio(ano: int, numero: int, cargo: str, uf: Optional[str] = None):
    f = get_parquet(ano)
    where, params = build_where(numero=numero, cargo=cargo, uf=uf)

    municipios = run(f"""
        SELECT NM_MUNICIPIO, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NM_MUNICIPIO
        ORDER BY total_votos DESC
    """, params)

    if not municipios:
        raise HTTPException(status_code=404, detail="Nenhum voto encontrado")
    return {"numero": numero, "cargo": cargo, "por_municipio": municipios}


@app.get("/candidato/secoes")
def votos_por_secao(ano: int, numero: int, cargo: str, municipio: str):
    f = get_parquet(ano)
    where, params = build_where(numero=numero, cargo=cargo, municipio=municipio)

    secoes = run(f"""
        SELECT NR_ZONA, NR_SECAO, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NR_ZONA, NR_SECAO
        ORDER BY NR_ZONA, NR_SECAO
    """, params)

    if not secoes:
        raise HTTPException(status_code=404, detail="Nenhuma seção encontrada")
    return {"municipio": municipio, "numero": numero, "cargo": cargo, "secoes": secoes}



@app.get("/eleicao/totais")
def eleicao_totais(ano: int, cargo: str, uf: str):
    f = get_parquet(ano)
    cargo_upper = cargo.strip().upper()
    uf_upper = uf.strip().upper()
    
    totais = run_one(f"""
        SELECT SUM(total_aptos)           as total_aptos,
               SUM(total_comparecimento)  as total_comparecimento,
               SUM(total_abstencoes)      as total_abstencoes,
               SUM(total_biometria_nh)    as total_biometria_nh,
               COUNT(*)                  as total_secoes
        FROM (
            SELECT NM_MUNICIPIO, NR_ZONA, NR_SECAO,
                   MAX(QT_APTOS)                  as total_aptos,
                   MAX(QT_COMPARECIMENTO)         as total_comparecimento,
                   MAX(QT_ABSTENCOES)             as total_abstencoes,
                   MAX(QT_ELEITORES_BIOMETRIA_NH) as total_biometria_nh
            FROM read_parquet('{f}')
            WHERE UPPER(SG_UF) = '{uf_upper}' AND UPPER(DS_CARGO_PERGUNTA) = '{cargo_upper}'
            GROUP BY NM_MUNICIPIO, NR_ZONA, NR_SECAO
        )
    """)

    if not totais or totais["total_secoes"] == 0:
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado")

    return {
        "aptos": totais["total_aptos"] or 0,
        "comparecimento": totais["total_comparecimento"] or 0,
        "abstencoes": totais["total_abstencoes"] or 0,
        "biometria_nh": totais["total_biometria_nh"] or 0,
        "secoes": totais["total_secoes"] or 0,
    }

    
@app.get("/candidato/completo")
def candidato_completo(ano: int, numero: int, cargo: str, uf: Optional[str] = None):
    f = get_parquet(ano)
    where, params = build_where(numero=numero, cargo=cargo, uf=uf)

    meta = run_one(f"""
        SELECT ANO_ELEICAO, CD_PLEITO, DT_PLEITO, NR_TURNO, DS_ELEICAO, SG_UF,
               NR_VOTAVEL, NM_VOTAVEL, DS_CARGO_PERGUNTA, DS_CARGO_PERGUNTA_SECAO,
               CD_TIPO_VOTAVEL, DS_TIPO_VOTAVEL, NR_PARTIDO, SG_PARTIDO, NM_PARTIDO
        FROM read_parquet('{f}') {where}
        LIMIT 1
    """, params)

    if not meta:
        raise HTTPException(status_code=404, detail="Candidato não encontrado")

    totais = run_one(f"""
        SELECT SUM(QT_VOTOS) as total_votos, SUM(QT_APTOS) as total_aptos,
               SUM(QT_COMPARECIMENTO) as total_comparecimento,
               SUM(QT_ABSTENCOES) as total_abstencoes,
               SUM(QT_ELEITORES_BIOMETRIA_NH) as total_biometria_nh
        FROM read_parquet('{f}') {where}
    """, params)

    por_municipio = run(f"""
        SELECT CD_MUNICIPIO, NM_MUNICIPIO, SUM(QT_VOTOS) as total_votos,
               SUM(QT_APTOS) as total_aptos, SUM(QT_COMPARECIMENTO) as total_comparecimento,
               SUM(QT_ABSTENCOES) as total_abstencoes
        FROM read_parquet('{f}') {where}
        GROUP BY CD_MUNICIPIO, NM_MUNICIPIO ORDER BY total_votos DESC
    """, params)

    por_zona = run(f"""
        SELECT NM_MUNICIPIO, NR_ZONA, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NM_MUNICIPIO, NR_ZONA ORDER BY NM_MUNICIPIO, NR_ZONA
    """, params)

    por_secao = run(f"""
        SELECT NM_MUNICIPIO, NR_ZONA, NR_SECAO, NR_LOCAL_VOTACAO, QT_VOTOS,
               CD_TIPO_URNA, DS_TIPO_URNA, NR_URNA_EFETIVADA,
               CD_CARGA_1_URNA_EFETIVADA, CD_CARGA_2_URNA_EFETIVADA,
               DT_CARGA_URNA_EFETIVADA, DT_ABERTURA, DT_ENCERRAMENTO,
               DS_AGREGADAS, NR_JUNTA_APURADORA, NR_TURMA_APURADORA,
               QT_APTOS, QT_COMPARECIMENTO, QT_ABSTENCOES,
               QT_ELEITORES_BIOMETRIA_NH, DT_GERACAO, HH_GERACAO
        FROM read_parquet('{f}') {where}
        ORDER BY NM_MUNICIPIO, NR_ZONA, NR_SECAO
    """, params)

    tv = totais
    return {
        "eleicao": {
            "ano": meta["ANO_ELEICAO"], "cd_pleito": meta["CD_PLEITO"],
            "dt_pleito": meta["DT_PLEITO"], "nr_turno": meta["NR_TURNO"],
            "ds_eleicao": meta["DS_ELEICAO"],
        },
        "candidato": {
            "numero": meta["NR_VOTAVEL"], "nome": meta["NM_VOTAVEL"],
            "uf": meta["SG_UF"], "cargo": meta["DS_CARGO_PERGUNTA"],
            "cargo_secao": meta["DS_CARGO_PERGUNTA_SECAO"],
            "cd_tipo_votavel": meta["CD_TIPO_VOTAVEL"],
            "ds_tipo_votavel": meta["DS_TIPO_VOTAVEL"],
        },
        "partido": {
            "numero": meta["NR_PARTIDO"], "sigla": meta["SG_PARTIDO"],
            "nome": meta["NM_PARTIDO"],
        },
        "totais": {
            "votos": tv["total_votos"] or 0, "aptos": tv["total_aptos"] or 0,
            "comparecimento": tv["total_comparecimento"] or 0,
            "abstencoes": tv["total_abstencoes"] or 0,
            "biometria_nh": tv["total_biometria_nh"] or 0,
        },
        "por_municipio": por_municipio,
        "por_zona": por_zona,
        "por_secao": por_secao,
    }


@app.get("/municipio/candidatos")
def candidatos_por_municipio(ano: int, municipio: str, cargo: str):
    f = get_parquet(ano)
    where, params = build_where(municipio=municipio, cargo=cargo)

    return run(f"""
        SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome, SUM(QT_VOTOS) as total_votos
        FROM read_parquet('{f}') {where}
        GROUP BY NR_VOTAVEL, NM_VOTAVEL
        ORDER BY total_votos DESC
    """, params)


# ── Dados Censo IBGE  ────────────────────────────────────────────────────────────────────




CENSO_PATH = "censo2022_brasil.json"

@lru_cache(maxsize=1)
def carregar_censo() -> dict:
    path = Path(CENSO_PATH)
    if not path.exists():
        raise RuntimeError(f"Arquivo não encontrado: {CENSO_PATH}")
    with open(path, encoding="utf-8") as f:
        lista = json.load(f)
    por_id = {m["id"]: m for m in lista}
    por_uf = {}
    for m in lista:
        uf = m.get("uf_sigla", "").upper()
        por_uf.setdefault(uf, []).append(m)
    return {"lista": lista, "por_id": por_id, "por_uf": por_uf}


def pop_municipio(m: dict):
    """populacao_total vem null do censo — usa raca.Total como fallback."""
    return m.get("populacao_total") or (m.get("raca") or {}).get("Total")


def resumo(m: dict) -> dict:
    return {
        "id":              m["id"],
        "municipio":       m["municipio"],
        "uf_sigla":        m.get("uf_sigla", ""),
        "uf_nome":         m.get("uf_nome", ""),
        "microrregiao":    m.get("microrregiao", ""),
        "mesorregiao":     m.get("mesorregiao", ""),
        "populacao_total": pop_municipio(m),
    }


def valor_metrica(m: dict, metrica: str) -> Optional[float]:
    if metrica == "populacao":
        return pop_municipio(m)
    if metrica == "renda_media":
        return (m.get("renda") or {}).get("renda_media_rs")
    if metrica == "tx_alfabetizacao":
        alfa = m.get("alfabetizacao") or {}
        vals = [v for v in alfa.values() if isinstance(v, (int, float))]
        return round(sum(vals) / len(vals), 2) if vals else None
    if metrica == "domicilios":
        return (m.get("domicilios") or {}).get("total")
    if metrica == "pct_parda":
        raca = m.get("raca") or {}
        total = raca.get("Total") or 0
        return round(raca.get("Parda", 0) / total * 100, 2) if total else None
    if metrica == "pct_branca":
        raca = m.get("raca") or {}
        total = raca.get("Total") or 0
        return round(raca.get("Branca", 0) / total * 100, 2) if total else None
    if metrica == "pct_preta":
        raca = m.get("raca") or {}
        total = raca.get("Total") or 0
        return round(raca.get("Preta", 0) / total * 100, 2) if total else None
    if metrica == "pct_indigena":
        raca = m.get("raca") or {}
        total = raca.get("Total") or 0
        return round(raca.get("Indígena", 0) / total * 100, 2) if total else None
    return None


MetricaRanking = Literal[
    "populacao", "renda_media", "tx_alfabetizacao",
    "domicilios", "pct_parda", "pct_branca", "pct_preta", "pct_indigena"
]


@app.get("/ibge/municipios", tags=["IBGE"])
def listar_municipios(uf: Optional[str] = None, limit: int = 100, offset: int = 0):
    """Lista todos os municípios (versão resumida). Filtrável por UF."""
    censo = carregar_censo()
    lista = censo["por_uf"].get(uf.upper(), []) if uf else censo["lista"]
    return {
        "total":      len(lista),
        "limit":      limit,
        "offset":     offset,
        "municipios": [resumo(m) for m in lista[offset: offset + limit]],
    }


@app.get("/ibge/municipio/busca", tags=["IBGE"])
def buscar_municipio(nome: str, uf: Optional[str] = None):
    """Busca municípios por nome (parcial, case-insensitive)."""
    censo  = carregar_censo()
    busca  = nome.strip().upper()
    lista  = censo["por_uf"].get(uf.upper(), censo["lista"]) if uf else censo["lista"]
    resultado = [resumo(m) for m in lista if busca in m["municipio"].upper()]
    if not resultado:
        raise HTTPException(status_code=404, detail="Nenhum município encontrado.")
    return resultado


@app.get("/ibge/municipio/{municipio_id}", tags=["IBGE"])
def get_municipio(municipio_id: int):
    """Retorna todos os dados censitários de um município pelo ID do IBGE."""
    censo = carregar_censo()
    m = censo["por_id"].get(municipio_id)
    if not m:
        raise HTTPException(status_code=404, detail=f"Município {municipio_id} não encontrado.")
    return m


@app.get("/ibge/uf/{uf}", tags=["IBGE"])
def get_uf(uf: str):
    """Retorna todos os municípios de uma UF (versão resumida)."""
    censo = carregar_censo()
    lista = censo["por_uf"].get(uf.upper())
    if not lista:
        raise HTTPException(status_code=404, detail=f"UF '{uf}' não encontrada.")
    return {
        "uf_sigla":         uf.upper(),
        "uf_nome":          lista[0].get("uf_nome", ""),
        "total_municipios": len(lista),
        "populacao_total":  sum(pop_municipio(m) or 0 for m in lista),
        "municipios":       [resumo(m) for m in lista],
    }


@app.get("/ibge/uf/{uf}/ranking", tags=["IBGE"])
def ranking_uf(
    uf: str,
    metrica: MetricaRanking = "populacao",
    ordem: Literal["desc", "asc"] = "desc",
    limit: int = 20,
):
    censo = carregar_censo()
    lista = censo["por_uf"].get(uf.upper())
    if not lista:
        raise HTTPException(status_code=404, detail=f"UF '{uf}' não encontrada.")
    com_valor = [
        {**resumo(m), "valor": valor_metrica(m, metrica)}
        for m in lista
    ]
    com_valor = sorted(
        [r for r in com_valor if r["valor"] is not None],
        key=lambda x: x["valor"], reverse=(ordem == "desc")
    )
    return {"uf_sigla": uf.upper(), "metrica": metrica, "ordem": ordem,
            "total": len(com_valor), "ranking": com_valor[:limit]}


@app.get("/ibge/brasil/ranking", tags=["IBGE"])
def ranking_brasil(
    metrica: MetricaRanking = "populacao",
    ordem: Literal["desc", "asc"] = "desc",
    uf: Optional[str] = None,
    limit: int = 20,
):
    censo = carregar_censo()
    lista = censo["por_uf"].get(uf.upper(), censo["lista"]) if uf else censo["lista"]
    com_valor = [
        {**resumo(m), "valor": valor_metrica(m, metrica)}
        for m in lista
    ]
    com_valor = sorted(
        [r for r in com_valor if r["valor"] is not None],
        key=lambda x: x["valor"], reverse=(ordem == "desc")
    )
    return {"metrica": metrica, "ordem": ordem, "uf": uf,
            "total": len(com_valor), "ranking": com_valor[:limit]}


@app.get("/ibge/brasil/resumo", tags=["IBGE"])
def resumo_brasil():
    """Totais e médias agregadas do Brasil."""
    censo  = carregar_censo()
    lista  = censo["lista"]
    rendas = [r for m in lista if (r := valor_metrica(m, "renda_media")) is not None]
    alfas  = [r for m in lista if (r := valor_metrica(m, "tx_alfabetizacao")) is not None]
    racas: dict = {}
    for m in lista:
        for k, v in (m.get("raca") or {}).items():
            if isinstance(v, (int, float)):
                racas[k] = racas.get(k, 0) + v
    return {
        "total_municipios":   len(lista),
        "populacao_total":    sum(pop_municipio(m) or 0 for m in lista),
        "renda_media_brasil": round(sum(rendas) / len(rendas), 2) if rendas else None,
        "tx_alfa_media":      round(sum(alfas)  / len(alfas),  2) if alfas  else None,
        "populacao_por_raca": racas,
    }




# ── Todos Endpoints Disponíveis  ──────────────────────────────────────────────────────────

# Lista todos os municípios (paginado)
# GET http://localhost:8000/ibge/municipios
# GET http://localhost:8000/ibge/municipios?uf=BA
# GET http://localhost:8000/ibge/municipios?uf=SP&limit=50&offset=0

# Busca por nome (parcial)
# GET http://localhost:8000/ibge/municipio/busca?nome=salvador
# GET http://localhost:8000/ibge/municipio/busca?nome=feira&uf=BA
# GET http://localhost:8000/ibge/municipio/busca?nome=sao

# Dados completos de 1 município pelo ID do IBGE
# GET http://localhost:8000/ibge/municipio/2927408    ← Salvador
# GET http://localhost:8000/ibge/municipio/2910800    ← Feira de Santana
# GET http://localhost:8000/ibge/municipio/3550308    ← São Paulo
# GET http://localhost:8000/ibge/municipio/3304557    ← Rio de Janeiro

# Todos os municípios de uma UF
# GET http://localhost:8000/ibge/uf/BA
# GET http://localhost:8000/ibge/uf/SP
# GET http://localhost:8000/ibge/uf/MG

# Ranking dentro de uma UF
# GET http://localhost:8000/ibge/uf/BA/ranking?metrica=populacao
# GET http://localhost:8000/ibge/uf/BA/ranking?metrica=renda_media&ordem=desc&limit=10
# GET http://localhost:8000/ibge/uf/BA/ranking?metrica=tx_alfabetizacao&ordem=asc
# GET http://localhost:8000/ibge/uf/SP/ranking?metrica=pct_parda&limit=5
# GET http://localhost:8000/ibge/uf/AM/ranking?metrica=pct_indigena

# Ranking nacional
# GET http://localhost:8000/ibge/brasil/ranking?metrica=populacao
# GET http://localhost:8000/ibge/brasil/ranking?metrica=renda_media&limit=10
# GET http://localhost:8000/ibge/brasil/ranking?metrica=renda_media&ordem=asc&limit=20  ← mais pobres
# GET http://localhost:8000/ibge/brasil/ranking?metrica=tx_alfabetizacao&ordem=asc      ← menor alfabetização
# GET http://localhost:8000/ibge/brasil/ranking?metrica=populacao&uf=BA                 ← ranking só na BA
# GET cargos
# /debug/cargos?ano=2022

# GET lista de candidatos
# /candidatos/lista?ano=2022&cargo=DEPUTADO FEDERAL
# /candidatos/lista?ano=2022&cargo=GOVERNADOR&uf=BA
# /candidatos/lista?ano=2018&cargo=SENADOR

# GET busca candidato (todos os cargos)
# /candidatos/busca?ano=2022&nome=joao
# /candidatos/busca?ano=2022&nome=silva&uf=BA

# GET /candidato
# /candidato?ano=2022&numero=6522&cargo=DEPUTADO FEDERAL
# /candidato?ano=2022&numero=13&cargo=GOVERNADOR&uf=BA
# /candidato?ano=2018&numero=4015&cargo=DEPUTADO ESTADUAL

# GET /candidato/municipios
# /candidato/municipios?ano=2022&numero=6522&cargo=DEPUTADO FEDERAL
# /candidato/municipios?ano=2022&numero=13&cargo=GOVERNADOR&uf=BA

# GET /candidato/secoes
# /candidato/secoes?ano=2022&numero=6522&cargo=DEPUTADO FEDERAL&municipio=SALVADOR
# /candidato/secoes?ano=2022&numero=13&cargo=GOVERNADOR&municipio=FEIRA DE SANTANA

# GET /candidato/completo
# /candidato/completo?ano=2022&numero=6522&cargo=DEPUTADO FEDERAL
# /candidato/completo?ano=2022&numero=13&cargo=GOVERNADOR&uf=BA
# /candidato/completo?ano=2018&numero=4015&cargo=DEPUTADO ESTADUAL

# GET /municipio/candidatos
# /municipio/candidatos?ano=2022&municipio=SALVADOR&cargo=DEPUTADO FEDERAL
# /municipio/candidatos?ano=2022&municipio=FEIRA DE SANTANA&cargo=GOVERNADOR
# /municipio/candidatos?ano=2018&municipio=VITORIA DA CONQUISTA&cargo=SENADOR
