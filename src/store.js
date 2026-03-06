import { create } from 'zustand';
import { fetchCandidateByNumber, fetchCandidatesList } from './elections';

// Candidate colors: 1st = tiffany, 2nd = red, 3rd = yellow
export const CANDIDATE_COLORS = [
  '#285058',  // tiffany (favorito)
  '#e8394a',  // vermelho
  '#f5a623',  // amarelo
  '#8b5cf6',  // roxo (fallback)
  '#06b6d4',  // cyan (fallback)
];

export const useStore = create((set, get) => ({
  // ── Year ───────────────────────────────────────────
  ano: 2022,
  setAno: async (novoAno) => {
    const { favorites, activeFavoriteIndex } = get();

    // Clear data & switch year, but KEEP favorites
    set({
      ano: novoAno,
      municipalData: {},
      selectedMunicipality: null,
      selectedUf: null,
      rankingData: null,
      compareCandidates: [],
      compareData: {},
      apiData: favorites.map(() => null),
      isLoading: favorites.length > 0,
    });

    // Re-fetch each favorite for the new year
    if (favorites.length > 0) {
      try {
        const updatedApiData = [];
        const mData = {};

        for (let i = 0; i < favorites.length; i++) {
          const fav = favorites[i];
          try {
            const cData = await fetchCandidateByNumber(fav.numero, fav.cargo, novoAno);
            updatedApiData.push(cData); // may be null

            if (cData?.por_municipio) {
              cData.por_municipio.forEach(m => {
                const mName = m.NM_MUNICIPIO
                  .split(' ')
                  .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join(' ');

                if (!mData[mName]) {
                  mData[mName] = { votes: new Array(favorites.length).fill(0) };
                }
                while (mData[mName].votes.length < favorites.length) {
                  mData[mName].votes.push(0);
                }
                mData[mName].votes[i] = m.total_votos;
              });
            }
          } catch (e) {
            console.warn(`Candidato ${fav.numero} não encontrado em ${novoAno}`);
            updatedApiData.push(null);
          }
        }

        // Pad all municipal entries
        Object.values(mData).forEach(m => {
          while (m.votes.length < favorites.length) m.votes.push(0);
        });

        set({
          apiData: updatedApiData,
          municipalData: mData,
          activeFavoriteIndex: activeFavoriteIndex,
          isLoading: false,
        });

        // Re-load ranking
        const activeFav = favorites[activeFavoriteIndex];
        if (activeFav) {
          get().loadRanking(activeFav.cargo);
        }
      } catch (e) {
        console.error('Erro ao recarregar favoritos:', e);
        set({ isLoading: false });
      }
    }
  },

  // ── Favorites (loaded candidates) ──────────────────
  favorites: [],
  activeFavoriteIndex: 0,
  apiData: [],
  municipalData: {},

  // ── Map state ──────────────────────────────────────
  selectedUf: null,
  selectedMunicipality: null,

  // ── Ranking ────────────────────────────────────────
  rankingData: null,
  rankingLoading: false,

  // ── Default Rankings (no candidate selected) ──────
  defaultRankings: {},       // { [cargo]: [...candidates] }
  defaultRankingsLoading: false,
  defaultCargoTab: 'PRESIDENTE',
  selectedDefaultUf: 'DF',

  loadDefaultRankings: async () => {
    const { ano, selectedDefaultUf } = get();
    set({ defaultRankingsLoading: true });
    const cargos = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL'];
    const stateCargos = ['GOVERNADOR', 'DEPUTADO ESTADUAL'];
    try {
      const results = await Promise.all(cargos.map(c => fetchCandidatesList(c, ano)));
      const rankings = {};

      for (let i = 0; i < cargos.length; i++) {
        const c = cargos[i];
        const isStateCargo = stateCargos.includes(c);
        let list = (results[i] || [])
          .filter(cand => cand.nome && !cand.nome.includes('#NULO#') && cand.nome.toUpperCase() !== 'NULO' && cand.nome.toUpperCase() !== 'BRANCO');

        // For state-level cargos, check if data belongs to the selected UF
        if (isStateCargo && selectedDefaultUf && list.length > 0) {
          // Detect actual state: load first candidate's data to check municipalities
          try {
            const firstCand = list[0];
            const candData = await fetch(
              `${import.meta.env.VITE_API_URL || 'https://readareleitoral-api.up.railway.app'}/candidato?numero=${firstCand.numero}&cargo=${encodeURIComponent(c)}&ano=${ano}`
            ).then(r => r.json());

            if (candData?.por_municipio?.length > 0) {
              const muniName = candData.por_municipio
                .sort((a, b) => b.total_votos - a.total_votos)[0]?.NM_MUNICIPIO;
              if (muniName) {
                const ibgeRes = await fetch(
                  `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(muniName)}`
                ).then(r => r.json());
                const exact = ibgeRes.find(m => m.nome.toUpperCase() === muniName.toUpperCase());
                const dataUf = (exact || ibgeRes[0])?.microrregiao?.mesorregiao?.UF?.sigla;
                if (dataUf && dataUf !== selectedDefaultUf) {
                  list = []; // Data doesn't belong to selected UF
                }
              }
            }
          } catch { /* detection failed, show data anyway */ }
        }

        rankings[c] = list.slice(0, 5);
      }

      set({ defaultRankings: rankings, defaultRankingsLoading: false });
    } catch (e) {
      console.error('Failed to load default rankings:', e);
      set({ defaultRankingsLoading: false });
    }
  },

  setDefaultCargoTab: (tab) => set({ defaultCargoTab: tab }),
  setSelectedDefaultUf: (uf) => {
    set({ selectedDefaultUf: uf });
    get().loadDefaultRankings();
  },

  // ── Comparison (multi) ─────────────────────────────
  compareCandidates: [],   // array of candidate objects
  compareData: {},         // { [numero]: cData }

  // ── Compare History (last 5 per cargo) ─────────────
  compareHistory: {},      // { [cargo]: [{ numero, nome, partido }] }

  // ── Seções Modal ───────────────────────────────────
  secoesModalOpen: false,
  openSecoesModal: () => set({ secoesModalOpen: true }),
  closeSecoesModal: () => set({ secoesModalOpen: false }),

  // ── Export Modal ────────────────────────────────────
  exportOpen: false,
  openExport: () => set({ exportOpen: true }),
  closeExport: () => set({ exportOpen: false }),

  // ── Loading ────────────────────────────────────────
  isLoading: false,

  // ── Load a candidate by number ─────────────────────
  loadCandidateByNumber: async (numero, cargo) => {
    set({ isLoading: true });
    try {
      const { ano } = get();
      const cData = await fetchCandidateByNumber(numero, cargo, ano);
      if (!cData) throw new Error('Candidato não encontrado');

      const state = get();
      const newFavorites = [...state.favorites];
      const newApiData = [...state.apiData];

      const nomeFormatado = cData.nome.split(' ')
        .map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase())
        .join(' ');
      const firstName = nomeFormatado.split(' ')[0];

      const newFavObj = {
        name: firstName,
        fullName: nomeFormatado,
        numero: numero,
        partido: cData.partido || '-',
        cargo: cData.cargo,
        ano: ano,
      };

      let idx = newFavorites.findIndex(c => c.numero === numero && c.cargo === newFavObj.cargo);
      if (idx === -1) {
        idx = newFavorites.length;
        newFavorites.push(newFavObj);
        newApiData.push(cData);
      } else {
        newApiData[idx] = cData;
      }

      // Build municipal data
      const mData = { ...state.municipalData };
      if (cData.por_municipio) {
        cData.por_municipio.forEach(m => {
          const mName = m.NM_MUNICIPIO
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');

          if (!mData[mName]) {
            mData[mName] = { votes: new Array(newFavorites.length).fill(0) };
          }
          while (mData[mName].votes.length < newFavorites.length) {
            mData[mName].votes.push(0);
          }
          mData[mName].votes[idx] = m.total_votos;
        });
      }

      Object.values(mData).forEach(m => {
        while (m.votes.length < newFavorites.length) {
          m.votes.push(0);
        }
      });

      set({
        favorites: newFavorites,
        apiData: newApiData,
        municipalData: mData,
        isLoading: false,
        activeFavoriteIndex: idx,
        rankingData: null,
      });

      get().loadRanking(newFavObj.cargo);

      // ── Auto-open state for state-level cargos ────
      const cargoUpper = (cData.cargo || cargo).toUpperCase();
      const isStateCargo = cargoUpper.includes('GOVERNADOR') || cargoUpper.includes('DEPUTADO ESTADUAL');
      if (isStateCargo && cData.por_municipio?.length > 0) {
        try {
          // Sort by votes desc and take top 5 unique names for UF detection
          const sorted = [...cData.por_municipio].sort((a, b) => b.total_votos - a.total_votos);
          const sampleNames = [...new Set(sorted.slice(0, 5).map(m => m.NM_MUNICIPIO))];

          const ufCounts = {};
          for (const muniName of sampleNames) {
            try {
              const ibgeRes = await fetch(
                `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(muniName)}`
              );
              const munis = await ibgeRes.json();
              // Check exact name match (case-insensitive) to avoid partial matches
              const exactMatch = munis.find(m => m.nome.toUpperCase() === muniName.toUpperCase());
              const target = exactMatch || munis[0];
              if (target) {
                const uf = target?.microrregiao?.mesorregiao?.UF?.sigla;
                if (uf) ufCounts[uf] = (ufCounts[uf] || 0) + 1;
              }
            } catch { /* skip failed lookup */ }
          }

          // Majority vote — pick UF that appears most
          const bestUf = Object.entries(ufCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (bestUf) get().selectUf(bestUf);
        } catch (e) {
          console.warn('Auto-state detection failed:', e);
        }
      }

      return cData;
    } catch (e) {
      console.error(e);
      set({ isLoading: false });
      throw e;
    }
  },

  // ── Load ranking for a cargo ───────────────────────
  loadRanking: async (cargo) => {
    const { ano } = get();
    set({ rankingLoading: true });
    try {
      const data = await fetchCandidatesList(cargo, ano);
      set({ rankingData: data, rankingLoading: false });
    } catch (e) {
      console.error(e);
      set({ rankingLoading: false });
    }
  },

  // ── Actions ────────────────────────────────────────
  setActiveFavorite: (idx) => {
    const fav = get().favorites[idx];
    set({ activeFavoriteIndex: idx, rankingData: null, compareCandidates: [], compareData: {} });
    if (fav) get().loadRanking(fav.cargo);
  },

  selectUf: (uf) => set({ selectedUf: uf, selectedMunicipality: null }),
  clearUf: () => set({ selectedUf: null, selectedMunicipality: null }),

  selectMunicipality: (name) => set({ selectedMunicipality: name }),

  // ── Compare: add/remove ────────────────────────────
  addCompareCandidate: async (cand) => {
    const { compareCandidates, ano, favorites, activeFavoriteIndex, compareHistory } = get();
    if (compareCandidates.find(c => c.numero === cand.numero)) return;

    const newComps = [...compareCandidates, cand];
    set({ compareCandidates: newComps });

    // Add to history
    const activeFav = favorites[activeFavoriteIndex];
    if (activeFav) {
      const cargo = activeFav.cargo;
      const existing = compareHistory[cargo] || [];
      const filtered = existing.filter(h => h.numero !== cand.numero);
      const updated = [{ numero: cand.numero, nome: cand.nome, partido: cand.partido, cargo: cand.cargo }, ...filtered].slice(0, 5);
      set({ compareHistory: { ...get().compareHistory, [cargo]: updated } });
    }

    // Fetch data
    try {
      const data = await fetchCandidateByNumber(cand.numero, cand.cargo, ano);
      if (data) {
        set({ compareData: { ...get().compareData, [cand.numero]: data } });
      }
    } catch (e) {
      console.error(e);
    }
  },

  removeCompareCandidate: (numero) => {
    const { compareCandidates, compareData } = get();
    const newComps = compareCandidates.filter(c => c.numero !== numero);
    const newData = { ...compareData };
    delete newData[numero];
    set({ compareCandidates: newComps, compareData: newData });
  },

  clearCompare: () => set({ compareCandidates: [], compareData: {} }),

  // ── Get compare history for current cargo ──────────
  getCompareHistory: () => {
    const { favorites, activeFavoriteIndex, compareHistory, compareCandidates } = get();
    const activeFav = favorites[activeFavoriteIndex];
    if (!activeFav) return [];
    const history = compareHistory[activeFav.cargo] || [];
    const activeNums = [activeFav.numero, ...compareCandidates.map(c => c.numero)];
    return history.filter(h => !activeNums.includes(h.numero));
  },

  removeFavorite: (idx) => {
    const state = get();
    const newFavorites = [...state.favorites];
    const newApiData = [...state.apiData];
    const newMunicipalData = { ...state.municipalData };

    newFavorites.splice(idx, 1);
    newApiData.splice(idx, 1);

    Object.values(newMunicipalData).forEach(m => {
      m.votes.splice(idx, 1);
    });

    let newIndex;
    if (newFavorites.length === 0) {
      newIndex = 0;
    } else if (idx === state.activeFavoriteIndex) {
      newIndex = Math.min(idx, newFavorites.length - 1);
    } else if (idx < state.activeFavoriteIndex) {
      newIndex = state.activeFavoriteIndex - 1;
    } else {
      newIndex = state.activeFavoriteIndex;
    }

    set({
      favorites: newFavorites,
      apiData: newApiData,
      municipalData: newMunicipalData,
      activeFavoriteIndex: newIndex,
      selectedMunicipality: null,
      compareCandidates: [],
      compareData: {},
    });
  },
}));
