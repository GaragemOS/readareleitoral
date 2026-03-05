import sqlite3
import pandas as pd

# # Caminho do seu SQLite
# db_path = "eleicoes_ba_2018_1turno.db"

# # Conecta
# conn = sqlite3.connect(db_path)

# # Escolha a tabela que quer converter
# tabela = "votos"

# # Lê toda a tabela
# df = pd.read_sql_query(f"SELECT * FROM {tabela}", conn)

# # Salva como Parquet
# df.to_parquet("eleicoes_ba_2018_1turno.parquet", engine="pyarrow", index=False)

# print("Conversão concluída!")


conn = sqlite3.connect("eleicoes_ba_2018_1turno.db")

# Lê tabela
df = pd.read_sql_query("SELECT * FROM votos", conn)

# Substitui strings inválidas por NaN
df["QT_ELEITORES_BIOMETRIA_NH"] = pd.to_numeric(
    df["QT_ELEITORES_BIOMETRIA_NH"], errors="coerce"
)

# Outras colunas numéricas podem ter problemas iguais
colunas_numericas = [
    "QT_VOTOS", "QT_APTOS", "QT_COMPARECIMENTO", "QT_ABSTENCOES"
]

for col in colunas_numericas:
    df[col] = pd.to_numeric(df[col], errors="coerce")

# Salva como Parquet
df.to_parquet("eleicoes_ba_2018_1turno.parquet", engine="pyarrow", index=False)