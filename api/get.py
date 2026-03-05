import sidrapy
import pandas as pd

print("Buscando dados detalhados por sexo (Censo 2022)...")


# Pega os códigos dos municípios da Bahia
meta = sidrapy.get_table(
    table_code="9514",
    territorial_level="6",
    ibge_territorial_code="all",
    variable="93",
)
meta_df = pd.DataFrame(meta)
meta_df.columns = meta_df.iloc[0]
meta_df = meta_df.iloc[1:]
codigos_ba = meta_df[meta_df['Município (Código)'].astype(str).str.startswith('29')]['Município (Código)'].tolist()
print(f"✅ {len(codigos_ba)} municípios encontrados.")

# Busca em lotes de 20
LOTE = 20
todos = []

for i in range(0, len(codigos_ba), LOTE):
    lote = codigos_ba[i:i+LOTE]
    print(f"  Lote {i+1}-{min(i+LOTE, len(codigos_ba))} de {len(codigos_ba)}...")

    try:
        data = sidrapy.get_table(
            table_code="9514",
            territorial_level="6",
            ibge_territorial_code=",".join(lote),
            variable="93",
            classifications={
                "2": "6707,6708",   # Homens e Mulheres
                "287": "100362",    # Idade: Total
                "286": "113635"     # Forma de declaração: Total
            }
        )
        df = pd.DataFrame(data)
        df.columns = df.iloc[0]
        df = df.iloc[1:]

        if i == 0:
            print("🔍 Valores brutos (primeiros 3):", df['Valor'].head(3).tolist())

        df['Valor'] = pd.to_numeric(df['Valor'], errors='coerce')
        todos.append(df)
        # time.sleep(0.5)

    except Exception as e:
        print(f"  ⚠️ Erro: {e}")
        continue

final = pd.concat(todos, ignore_index=True)

pivot_df = final.pivot_table(
    index=['Município (Código)', 'Município'],
    columns='Sexo (Código)',
    values='Valor',
    aggfunc='sum'
).reset_index()

pivot_df.columns.name = None
pivot_df = pivot_df.rename(columns={
    '6707': 'pop_homens',
    '6708': 'pop_mulheres'
})

pivot_df['pop_total'] = pivot_df['pop_homens'] + pivot_df['pop_mulheres']
pivot_df = pivot_df.sort_values(by='pop_total', ascending=False).reset_index(drop=True)

print("\n--- Radar Eleitoral: População por Sexo na Bahia ---")
print(pivot_df.head(10))

pivot_df.to_csv("populacao_bahia_sexo.csv", index=False, encoding='utf-8-sig')
print(f"\n✅ Sucesso! {len(pivot_df)} municípios salvos.")