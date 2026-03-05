
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import duckdb
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




# ── Todos Endpoints Disponíveis  ──────────────────────────────────────────────────────────

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
