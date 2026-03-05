
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import duckdb
app = FastAPI()





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


# ── Arquivos Parquet ──────────────────────────────────────────────────────────
parquet_files = {
    2018: "eleicoes_ba_2018_1turno.parquet",
    2022: "eleicoes_ba_2022_1turno.parquet",
}

def get_parquet(ano: int) -> str:
    path = parquet_files.get(ano)
    if not path:
        raise HTTPException(status_code=400, detail=f"Ano inválido: {ano}. Use {list(parquet_files.keys())}.")
    return path

def conn():
    return duckdb.connect()

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
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

# from fastapi import FastAPI, HTTPException
# from sqlalchemy import create_engine, text
# from typing import Optional
# from fastapi.middleware.cors import CORSMiddleware

# app = FastAPI()

# # ── Engines por ano ───────────────────────────────────────────────────────────
# engines = {
#     2018: create_engine("sqlite:///eleicoes_ba_2018_1turno.db"),
#     2022: create_engine("sqlite:///eleicoes_ba_2022_1turno.db"),
# }


# def get_engine(ano: int):
#     engine = engines.get(ano)
#     if not engine:
#         raise HTTPException(status_code=400, detail=f"Ano inválido: {ano}. Use {list(engines.keys())}.")
#     return engine

# engine_contexto = create_engine("sqlite:///socioeconomico_ba.db")
# # ── CORS ──────────────────────────────────────────────────────────────────────
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # ── Helper WHERE ──────────────────────────────────────────────────────────────
# def build_where(**kwargs) -> tuple[str, dict]:
#     """
#     Constrói cláusula WHERE dinamicamente.
#     Kwargs aceitos: numero, cargo, uf, municipio, nome (LIKE).
#     """
#     clauses = []
#     params = {}

#     if kwargs.get("numero") is not None:
#         clauses.append("NR_VOTAVEL = :numero")
#         params["numero"] = kwargs["numero"]

#     if kwargs.get("cargo"):
#         clauses.append("UPPER(DS_CARGO_PERGUNTA) = UPPER(:cargo)")
#         params["cargo"] = kwargs["cargo"].strip()

#     if kwargs.get("uf"):
#         clauses.append("UPPER(SG_UF) = UPPER(:uf)")
#         params["uf"] = kwargs["uf"].strip()

#     if kwargs.get("municipio"):
#         clauses.append("UPPER(NM_MUNICIPIO) = UPPER(:municipio)")
#         params["municipio"] = kwargs["municipio"].strip()

#     if kwargs.get("nome"):
#         clauses.append("UPPER(NM_VOTAVEL) LIKE :nome")
#         params["nome"] = f"%{kwargs['nome'].strip().upper()}%"

#     where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
#     return where, params


# # ─────────────────────────────────────────────────────────────────────────────
# # ROTAS
# # ─────────────────────────────────────────────────────────────────────────────

# @app.get("/candidato")
# def get_candidato(ano: int, numero: int, cargo: str, uf: Optional[str] = None):
#     engine = get_engine(ano)
#     where, params = build_where(numero=numero, cargo=cargo, uf=uf)

#     with engine.connect() as conn:
#         result = conn.execute(text(f"""
#             SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome,
#                    DS_CARGO_PERGUNTA as cargo,
#                    SG_PARTIDO as partido, SUM(QT_VOTOS) as total_votos
#             FROM votos {where}
#             GROUP BY NR_VOTAVEL, NM_VOTAVEL, DS_CARGO_PERGUNTA, SG_PARTIDO
#         """), params).fetchone()

#         if not result:
#             raise HTTPException(status_code=404, detail="Candidato não encontrado")

#         mun_result = conn.execute(text(f"""
#             SELECT NM_MUNICIPIO, SUM(QT_VOTOS) as total_votos
#             FROM votos {where}
#             GROUP BY NM_MUNICIPIO
#             ORDER BY total_votos DESC
#         """), params)
#         por_municipio = [dict(r._mapping) for r in mun_result]

#     return {
#         **dict(result._mapping),
#         "por_municipio": por_municipio,
#     }


# @app.get("/candidatos/lista")
# def listar_candidatos(ano: int, cargo: str, uf: Optional[str] = None):
#     engine = get_engine(ano)
#     where, params = build_where(cargo=cargo, uf=uf)

#     with engine.connect() as conn:
#         result = conn.execute(text(f"""
#             SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome,
#                    SG_PARTIDO as partido, SUM(QT_VOTOS) as total_votos
#             FROM votos {where}
#             GROUP BY NR_VOTAVEL, NM_VOTAVEL, SG_PARTIDO
#             ORDER BY total_votos DESC
#         """), params)
#         candidatos = [dict(r._mapping) for r in result]

#     if not candidatos:
#         raise HTTPException(status_code=404, detail="Nenhum candidato encontrado")

#     return candidatos


# @app.get("/candidatos/busca")
# def buscar_candidatos(ano: int, nome: str, uf: Optional[str] = None):
#     engine = get_engine(ano)
#     where, params = build_where(nome=nome, uf=uf)

#     with engine.connect() as conn:
#         result = conn.execute(text(f"""
#             SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome,
#                    DS_CARGO_PERGUNTA as cargo,
#                    SG_PARTIDO as partido, SUM(QT_VOTOS) as total_votos
#             FROM votos {where}
#             GROUP BY NR_VOTAVEL, NM_VOTAVEL, DS_CARGO_PERGUNTA, SG_PARTIDO
#             ORDER BY total_votos DESC
#             LIMIT 20
#         """), params)
#         return [dict(r._mapping) for r in result]


# @app.get("/municipio/candidatos")
# def candidatos_por_municipio(ano: int, municipio: str, cargo: str):
#     engine = get_engine(ano)
#     where, params = build_where(municipio=municipio, cargo=cargo)

#     with engine.connect() as conn:
#         result = conn.execute(text(f"""
#             SELECT NR_VOTAVEL as numero, NM_VOTAVEL as nome, SUM(QT_VOTOS) as total_votos
#             FROM votos {where}
#             GROUP BY NR_VOTAVEL, NM_VOTAVEL
#             ORDER BY total_votos DESC
#         """), params)
#         return [dict(r._mapping) for r in result]


# @app.get("/candidato/secoes")
# def votos_por_secao(ano: int, numero: int, cargo: str, municipio: str):
#     engine = get_engine(ano)
#     where, params = build_where(numero=numero, cargo=cargo, municipio=municipio)

#     with engine.connect() as conn:
#         result = conn.execute(text(f"""
#             SELECT NR_ZONA, NR_SECAO, SUM(QT_VOTOS) as total_votos
#             FROM votos {where}
#             GROUP BY NR_ZONA, NR_SECAO
#             ORDER BY NR_ZONA, NR_SECAO
#         """), params)
#         secoes = [dict(r._mapping) for r in result]

#     if not secoes:
#         raise HTTPException(status_code=404, detail="Nenhuma seção encontrada")

#     return {"municipio": municipio, "numero": numero, "cargo": cargo, "secoes": secoes}


# @app.get("/candidato/municipios")
# def votos_por_municipio(ano: int, numero: int, cargo: str, uf: Optional[str] = None):
#     engine = get_engine(ano)
#     where, params = build_where(numero=numero, cargo=cargo, uf=uf)

#     with engine.connect() as conn:
#         result = conn.execute(text(f"""
#             SELECT NM_MUNICIPIO, SUM(QT_VOTOS) as total_votos
#             FROM votos {where}
#             GROUP BY NM_MUNICIPIO
#             ORDER BY total_votos DESC
#         """), params)
#         municipios = [dict(r._mapping) for r in result]

#     if not municipios:
#         raise HTTPException(status_code=404, detail="Nenhum voto encontrado")

#     return {"numero": numero, "cargo": cargo, "por_municipio": municipios}


# @app.get("/candidato/completo")
# def candidato_completo(
#     ano: int,
#     numero: int,
#     cargo: str,
#     uf: Optional[str] = None
# ):
#     engine = get_engine(ano)
#     where, params = build_where(numero=numero, cargo=cargo, uf=uf)

#     with engine.connect() as conn:

#         # 1️⃣ METADADOS DO CANDIDATO (SEM SUM, SEM GROUP BY)
#         meta = conn.execute(text(f"""
#             SELECT
#                 ANO_ELEICAO,
#                 CD_PLEITO, DT_PLEITO, NR_TURNO, DS_ELEICAO,
#                 SG_UF,
#                 NR_VOTAVEL, NM_VOTAVEL,
#                 DS_CARGO_PERGUNTA, DS_CARGO_PERGUNTA_SECAO,
#                 CD_TIPO_VOTAVEL, DS_TIPO_VOTAVEL,
#                 NR_PARTIDO, SG_PARTIDO, NM_PARTIDO
#             FROM votos
#             {where}
#             LIMIT 1
#         """), params).fetchone()

#         if not meta:
#             raise HTTPException(status_code=404, detail="Candidato não encontrado")

#         # 2️⃣ TOTAIS GERAIS (SEM GROUP BY)
#         totais = conn.execute(text(f"""
#             SELECT
#                 SUM(QT_VOTOS) as total_votos,
#                 SUM(QT_APTOS) as total_aptos,
#                 SUM(QT_COMPARECIMENTO) as total_comparecimento,
#                 SUM(QT_ABSTENCOES) as total_abstencoes,
#                 SUM(QT_ELEITORES_BIOMETRIA_NH) as total_biometria_nh
#             FROM votos
#             {where}
#         """), params).fetchone()

#         # 3️⃣ POR MUNICÍPIO
#         por_municipio = [
#             dict(r._mapping)
#             for r in conn.execute(text(f"""
#                 SELECT
#                     CD_MUNICIPIO,
#                     NM_MUNICIPIO,
#                     SUM(QT_VOTOS) as total_votos,
#                     SUM(QT_APTOS) as total_aptos,
#                     SUM(QT_COMPARECIMENTO) as total_comparecimento,
#                     SUM(QT_ABSTENCOES) as total_abstencoes
#                 FROM votos
#                 {where}
#                 GROUP BY CD_MUNICIPIO, NM_MUNICIPIO
#                 ORDER BY total_votos DESC
#             """), params)
#         ]

#         # 4️⃣ POR ZONA
#         por_zona = [
#             dict(r._mapping)
#             for r in conn.execute(text(f"""
#                 SELECT
#                     NM_MUNICIPIO,
#                     NR_ZONA,
#                     SUM(QT_VOTOS) as total_votos
#                 FROM votos
#                 {where}
#                 GROUP BY NM_MUNICIPIO, NR_ZONA
#                 ORDER BY NM_MUNICIPIO, NR_ZONA
#             """), params)
#         ]

#         # 5️⃣ POR SEÇÃO (DADOS BRUTOS)
#         por_secao = [
#             dict(r._mapping)
#             for r in conn.execute(text(f"""
#                 SELECT
#                     NM_MUNICIPIO,
#                     NR_ZONA,
#                     NR_SECAO,
#                     NR_LOCAL_VOTACAO,
#                     QT_VOTOS,
#                     CD_TIPO_URNA,
#                     DS_TIPO_URNA,
#                     NR_URNA_EFETIVADA,
#                     CD_CARGA_1_URNA_EFETIVADA,
#                     CD_CARGA_2_URNA_EFETIVADA,
#                     DT_CARGA_URNA_EFETIVADA,
#                     DT_ABERTURA,
#                     DT_ENCERRAMENTO,
#                     DS_AGREGADAS,
#                     NR_JUNTA_APURADORA,
#                     NR_TURMA_APURADORA,
#                     QT_APTOS,
#                     QT_COMPARECIMENTO,
#                     QT_ABSTENCOES,
#                     QT_ELEITORES_BIOMETRIA_NH,
#                     DT_GERACAO,
#                     HH_GERACAO
#                 FROM votos
#                 {where}
#                 ORDER BY NM_MUNICIPIO, NR_ZONA, NR_SECAO
#             """), params)
#         ]

#     m = meta._mapping
#     t = totais._mapping

#     return {
#         "eleicao": {
#             "ano": m["ANO_ELEICAO"],
#             "cd_pleito": m["CD_PLEITO"],
#             "dt_pleito": m["DT_PLEITO"],
#             "nr_turno": m["NR_TURNO"],
#             "ds_eleicao": m["DS_ELEICAO"],
#         },
#         "candidato": {
#             "numero": m["NR_VOTAVEL"],
#             "nome": m["NM_VOTAVEL"],
#             "uf": m["SG_UF"],
#             "cargo": m["DS_CARGO_PERGUNTA"],
#             "cargo_secao": m["DS_CARGO_PERGUNTA_SECAO"],
#             "cd_tipo_votavel": m["CD_TIPO_VOTAVEL"],
#             "ds_tipo_votavel": m["DS_TIPO_VOTAVEL"],
#         },
#         "partido": {
#             "numero": m["NR_PARTIDO"],
#             "sigla": m["SG_PARTIDO"],
#             "nome": m["NM_PARTIDO"],
#         },
#         "totais": {
#             "votos": t["total_votos"] or 0,
#             "aptos": t["total_aptos"] or 0,
#             "comparecimento": t["total_comparecimento"] or 0,
#             "abstencoes": t["total_abstencoes"] or 0,
#             "biometria_nh": t["total_biometria_nh"] or 0,
#         },
#         "por_municipio": por_municipio,
#         "por_zona": por_zona,
#         "por_secao": por_secao,
#     }


# @app.get("/debug/cargos")
# def listar_cargos(ano: int):
#     engine = get_engine(ano)
#     with engine.connect() as conn:
#         result = conn.execute(text(
#             "SELECT DISTINCT DS_CARGO_PERGUNTA FROM votos ORDER BY DS_CARGO_PERGUNTA"
#         ))
#         return [row[0] for row in result]
    





# from scipy.stats import pearsonr

# # Socio Economico Bahia

# @app.get("/candidato/analise")
# def analise(ano: int, numero: int, cargo: str):

#     engine = get_engine(ano)
#     where, params = build_where(numero=numero, cargo=cargo)

#     with engine.connect() as conn:

#         votos = conn.execute(text(f"""
#             SELECT 
#                 CD_MUNICIPIO,
#                 NM_MUNICIPIO,
#                 SUM(QT_VOTOS) as votos
#             FROM votos {where}
#             GROUP BY CD_MUNICIPIO, NM_MUNICIPIO
#         """), params).fetchall()

#     if not votos:
#         return {"debug": "Nenhum voto encontrado", "ano": ano, "numero": numero, "cargo": cargo}

#     with engine_contexto.connect() as conn:
#         socio = conn.execute(text("""
#             SELECT CD_MUNICIPIO, renda_media, idh, populacao
#             FROM municipios_contexto
#         """)).fetchall()

#     socio_dict = {row.CD_MUNICIPIO: dict(row._mapping) for row in socio}

#     resultado = []

#     for v in votos:
#         if v.CD_MUNICIPIO in socio_dict:
#             contexto = socio_dict[v.CD_MUNICIPIO]

#             resultado.append({
#                 "municipio": v.NM_MUNICIPIO,
#                 "votos": v.votos,
#                 "renda_media": contexto["renda_media"],
#                 "idh": contexto["idh"],
#                 "populacao": contexto["populacao"]
#             })

#     return resultado

#     return resultado
# @app.get("/candidato/perfil-socio")
# def perfil_socio(ano: int, numero: int, cargo: str):
#     engine = get_engine(ano)
#     where, params = build_where(numero=numero, cargo=cargo)

#     with engine.connect() as conn_votos, engine_contexto.connect() as conn_ctx:

#         votos = conn_votos.execute(text(f"""
#             SELECT CD_MUNICIPIO, SUM(QT_VOTOS) as votos
#             FROM votos {where}
#             GROUP BY CD_MUNICIPIO
#         """), params).fetchall()

#         if not votos:
#             raise HTTPException(status_code=404, detail="Sem votos")

#         total_votos = sum(v.votos for v in votos)

#         renda_ponderada = 0
#         idh_ponderado = 0

#         for v in votos:
#             ctx = conn_ctx.execute(text("""
#                 SELECT renda_media, idh
#                 FROM municipios_contexto
#                 WHERE cd_municipio = :id
#             """), {"id": v.CD_MUNICIPIO}).fetchone()

#             if ctx:
#                 peso = v.votos / total_votos
#                 renda_ponderada += ctx.renda_media * peso
#                 idh_ponderado += ctx.idh * peso

#     return {
#         "numero": numero,
#         "media_renda_base": round(renda_ponderada, 2),
#         "media_idh_base": round(idh_ponderado, 3),
#         "total_votos": total_votos
#     }

# @app.get("/candidato/correlacao-renda")
# def correlacao_renda(ano: int, numero: int, cargo: str):

#     engine = get_engine(ano)

#     with engine.connect() as conn_votos, engine_contexto.connect() as conn_ctx:

#         # Percentual do candidato por município
#         dados = conn_votos.execute(text("""
#             SELECT 
#                 v.CD_MUNICIPIO,
#                 v.NM_MUNICIPIO,
#                 SUM(v.QT_VOTOS) as votos_candidato,
#                 (
#                     SUM(v.QT_VOTOS) * 100.0 /
#                     (
#                         SELECT SUM(QT_VOTOS)
#                         FROM votos
#                         WHERE CD_MUNICIPIO = v.CD_MUNICIPIO
#                         AND DS_CARGO_PERGUNTA = :cargo
#                     )
#                 ) as percentual
#             FROM votos v
#             WHERE v.NR_VOTAVEL = :numero
#             AND v.DS_CARGO_PERGUNTA = :cargo
#             GROUP BY v.CD_MUNICIPIO, v.NM_MUNICIPIO
#         """), {"numero": numero, "cargo": cargo}).fetchall()

#         lista_percentual = []
#         lista_renda = []

#         for d in dados:
#             ctx = conn_ctx.execute(text("""
#                 SELECT renda_media
#                 FROM municipios_contexto
#                 WHERE cd_municipio = :id
#             """), {"id": d.CD_MUNICIPIO}).fetchone()

#             if ctx:
#                 lista_percentual.append(d.percentual)
#                 lista_renda.append(ctx.renda_media)

#         if len(lista_percentual) < 5:
#             raise HTTPException(status_code=400, detail="Dados insuficientes")

#         corr, p_value = pearsonr(lista_renda, lista_percentual)

#     return {
#         "correlacao_renda": round(corr, 3),
#         "p_value": round(p_value, 5),
#         "interpretacao": interpretar_correlacao(corr)
#     }

# def interpretar_correlacao(corr):
#     if corr > 0.5:
#         return "Candidato mais forte em municípios de alta renda"
#     elif corr < -0.5:
#         return "Candidato mais forte em municípios de baixa renda"
#     else:
#         return "Correlação fraca ou neutra"
    
# @app.get("/candidato/oportunidades")
# def oportunidades(ano: int, numero: int, cargo: str):

#     engine = get_engine(ano)
#     where, params = build_where(numero=numero, cargo=cargo)

#     with engine.connect() as conn_votos, engine_contexto.connect() as conn_ctx:

#         votos = conn_votos.execute(text(f"""
#             SELECT CD_MUNICIPIO, NM_MUNICIPIO,
#                    SUM(QT_VOTOS) as votos,
#                    SUM(QT_VOTOS) * 1.0 / SUM(SUM(QT_VOTOS)) OVER() * 100 as percentual
#             FROM votos {where}
#             GROUP BY CD_MUNICIPIO, NM_MUNICIPIO
#         """), params).fetchall()

#         ranking = []

#         for v in votos:
#             ctx = conn_ctx.execute(text("""
#                 SELECT populacao, crescimento_percent
#                 FROM municipios_contexto
#                 WHERE cd_municipio = :id
#             """), {"id": v.CD_MUNICIPIO}).fetchone()

#             if ctx:
#                 score = (
#                     (1 - v.percentual / 100) * 0.5 +
#                     (ctx.crescimento_percent / 10) * 0.3 +
#                     (ctx.populacao / 1000000) * 0.2
#                 )

#                 ranking.append({
#                     "municipio": v.NM_MUNICIPIO,
#                     "score": round(score, 3),
#                     "percentual_atual": round(v.percentual, 2)
#                 })

#         ranking.sort(key=lambda x: x["score"], reverse=True)

#     return ranking[:20]