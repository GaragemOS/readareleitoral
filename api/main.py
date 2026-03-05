import pandas as pd
from sqlalchemy import create_engine

engine = create_engine("sqlite:///eleicoes_ba_2018_1turno.db")

arquivo = "1turno2018.csv"

chunksize = 200_000

for chunk in pd.read_csv(
    arquivo,
    sep=";",
    encoding="latin1",
    chunksize=chunksize,
    low_memory=False
):
    chunk.to_sql(
        "votos",
        engine,
        if_exists="append",
        index=False
    )

print("ETL concluído 🚀")