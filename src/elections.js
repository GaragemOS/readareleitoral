export const API_URL = import.meta.env.VITE_API_URL || 'https://readareleitoral-api.up.railway.app';

export const fetchCandidateByNumber = async (numero, cargo, ano = 2022) => {
  try {
    const res = await fetch(
      `${API_URL}/candidato?numero=${numero}&cargo=${encodeURIComponent(cargo)}&ano=${ano}`
    );
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Erro ao buscar candidato');
    }
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const fetchCandidatesList = async (cargo, ano = 2022, extraParams = '') => {
  try {
    const res = await fetch(
      `${API_URL}/candidatos/lista?cargo=${encodeURIComponent(cargo)}&ano=${ano}${extraParams}`
    );
    if (!res.ok) throw new Error('Erro ao listar candidatos');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const searchCandidates = async (nome, ano = 2022) => {
  try {
    const res = await fetch(
      `${API_URL}/candidatos/busca?ano=${ano}&nome=${encodeURIComponent(nome)}`
    );
    if (!res.ok) throw new Error('Erro ao buscar candidatos');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const fetchCandidatoCompleto = async (numero, cargo, ano = 2022) => {
  try {
    const res = await fetch(
      `${API_URL}/candidato/completo?ano=${ano}&numero=${numero}&cargo=${encodeURIComponent(cargo)}`
    );
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const fetchCandidatoSecoes = async (numero, cargo, municipio, ano = 2022) => {
  try {
    const res = await fetch(
      `${API_URL}/candidato/secoes?ano=${ano}&numero=${numero}&cargo=${encodeURIComponent(cargo)}&municipio=${encodeURIComponent(municipio)}`
    );
    if (!res.ok) throw new Error('Erro ao buscar seções');
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const fetchMunicipioCandidatos = async (municipio, cargo, ano = 2022) => {
  try {
    const res = await fetch(
      `${API_URL}/municipio/candidatos?ano=${ano}&municipio=${encodeURIComponent(municipio)}&cargo=${encodeURIComponent(cargo)}`
    );
    if (!res.ok) throw new Error('Erro ao buscar candidatos do município');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
};