import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore, CANDIDATE_COLORS } from '../store';
import { searchCandidates } from '../elections';
import { getMuniData } from '../utils';
import { Search, X, MapPin, Trophy, BarChart3, FileDown, Grid3x3, Clock } from 'lucide-react';
import PieChart from './PieChart';
import './Sidebar.css';

export default function Sidebar() {
    const favorites = useStore(s => s.favorites);
    const activeFavoriteIndex = useStore(s => s.activeFavoriteIndex);
    const apiData = useStore(s => s.apiData);
    const isLoading = useStore(s => s.isLoading);
    const municipalData = useStore(s => s.municipalData);
    const selectedMunicipality = useStore(s => s.selectedMunicipality);
    const selectedUf = useStore(s => s.selectedUf);
    const ano = useStore(s => s.ano);
    const rankingData = useStore(s => s.rankingData);
    const rankingLoading = useStore(s => s.rankingLoading);
    const compareCandidates = useStore(s => s.compareCandidates);
    const addCompareCandidate = useStore(s => s.addCompareCandidate);
    const removeCompareCandidate = useStore(s => s.removeCompareCandidate);
    const openExport = useStore(s => s.openExport);
    const openSecoesModal = useStore(s => s.openSecoesModal);
    const getCompareHistory = useStore(s => s.getCompareHistory);

    const [compareSearch, setCompareSearch] = useState('');
    const [compareResults, setCompareResults] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    const activeFav = favorites[activeFavoriteIndex];
    const hasData = apiData[activeFavoriteIndex] != null;
    // ── Use normalized lookup so accented IBGE names match API keys ──
    const data = selectedMunicipality ? getMuniData(municipalData, selectedMunicipality) : null;
    const currentVotes = data?.votes?.[activeFavoriteIndex] || 0;
    const isComparing = compareCandidates.length > 0;

    const history = getCompareHistory();

    // ── Ranking position for active candidate ─────────
    const rankingPosition = (() => {
        if (!rankingData || !activeFav) return null;
        const idx = rankingData.findIndex(c => c.numero === activeFav.numero);
        return idx >= 0 ? idx + 1 : null;
    })();

    // ── Comparative ranking ────────────────────────────
    const comparativeRanking = (() => {
        if (!rankingData || !activeFav) return [];

        if (!isComparing) {
            const idx = rankingData.findIndex(c => c.numero === activeFav.numero);
            if (idx < 0) return [];
            const start = Math.max(0, idx - 2);
            const end = Math.min(rankingData.length, idx + 3);
            return rankingData.slice(start, end).map((c, i) => ({
                ...c,
                position: start + i + 1,
                isActive: c.numero === activeFav.numero,
                colorIdx: c.numero === activeFav.numero ? 0 : -1,
            }));
        }

        const allNums = [activeFav.numero, ...compareCandidates.map(c => c.numero)];
        const items = [];
        rankingData.forEach((c, i) => {
            if (allNums.includes(c.numero)) {
                const compIdx = compareCandidates.findIndex(comp => comp.numero === c.numero);
                items.push({
                    ...c,
                    position: i + 1,
                    isActive: c.numero === activeFav.numero,
                    colorIdx: c.numero === activeFav.numero ? 0 : compIdx + 1,
                });
            }
        });
        return items;
    })();

    // ── Compare search ─────────────────────────────────
    useEffect(() => {
        if (compareSearch.trim().length < 2) {
            setCompareResults([]);
            return;
        }
        setShowHistory(false);
        const timer = setTimeout(async () => {
            const results = await searchCandidates(compareSearch, ano);
            const filtered = activeFav
                ? results.filter(c => c.cargo === activeFav.cargo && c.numero !== activeFav.numero)
                : results;

            const historyNums = (history || []).map(h => h.numero);
            const sorted = [...filtered].sort((a, b) => {
                const aInHistory = historyNums.includes(a.numero) ? 0 : 1;
                const bInHistory = historyNums.includes(b.numero) ? 0 : 1;
                return aInHistory - bInHistory;
            });

            setCompareResults(sorted);
        }, 400);
        return () => clearTimeout(timer);
    }, [compareSearch, ano, activeFav, history]);

    const handleAddCompare = useCallback((c) => {
        addCompareCandidate(c);
        setCompareSearch('');
        setCompareResults([]);
        setShowHistory(false);
    }, [addCompareCandidate]);

    const handleHistoryAdd = useCallback((h) => {
        addCompareCandidate(h);
        setShowHistory(false);
    }, [addCompareCandidate]);

    // ── Default rankings (no candidate) ───────────────
    const defaultRankings = useStore(s => s.defaultRankings);
    const defaultRankingsLoading = useStore(s => s.defaultRankingsLoading);
    const defaultCargoTab = useStore(s => s.defaultCargoTab);
    const setDefaultCargoTab = useStore(s => s.setDefaultCargoTab);
    const loadDefaultRankings = useStore(s => s.loadDefaultRankings);
    const loadCandidateByNumber = useStore(s => s.loadCandidateByNumber);
    const selectedDefaultUf = useStore(s => s.selectedDefaultUf);
    const setSelectedDefaultUf = useStore(s => s.setSelectedDefaultUf);

    const UF_OPTIONS = [
        { sigla: 'AC', nome: 'Acre' }, { sigla: 'AL', nome: 'Alagoas' }, { sigla: 'AP', nome: 'Amapá' },
        { sigla: 'AM', nome: 'Amazonas' }, { sigla: 'BA', nome: 'Bahia' }, { sigla: 'CE', nome: 'Ceará' },
        { sigla: 'DF', nome: 'Distrito Federal' }, { sigla: 'ES', nome: 'Espírito Santo' },
        { sigla: 'GO', nome: 'Goiás' }, { sigla: 'MA', nome: 'Maranhão' }, { sigla: 'MT', nome: 'Mato Grosso' },
        { sigla: 'MS', nome: 'Mato Grosso do Sul' }, { sigla: 'MG', nome: 'Minas Gerais' },
        { sigla: 'PA', nome: 'Pará' }, { sigla: 'PB', nome: 'Paraíba' }, { sigla: 'PR', nome: 'Paraná' },
        { sigla: 'PE', nome: 'Pernambuco' }, { sigla: 'PI', nome: 'Piauí' }, { sigla: 'RJ', nome: 'Rio de Janeiro' },
        { sigla: 'RN', nome: 'Rio Grande do Norte' }, { sigla: 'RS', nome: 'Rio Grande do Sul' },
        { sigla: 'RO', nome: 'Rondônia' }, { sigla: 'RR', nome: 'Roraima' }, { sigla: 'SC', nome: 'Santa Catarina' },
        { sigla: 'SP', nome: 'São Paulo' }, { sigla: 'SE', nome: 'Sergipe' }, { sigla: 'TO', nome: 'Tocantins' },
    ];

    const DEFAULT_CARGOS = [
        { key: 'PRESIDENTE', label: 'Presidente' },
        { key: 'GOVERNADOR', label: 'Governador' },
        { key: 'SENADOR', label: 'Senador' },
        { key: 'DEPUTADO FEDERAL', label: 'Dep. Federal' },
        { key: 'DEPUTADO ESTADUAL', label: 'Dep. Estadual' },
    ];

    const isStateLevelTab = defaultCargoTab === 'GOVERNADOR' || defaultCargoTab === 'DEPUTADO ESTADUAL';

    useEffect(() => {
        if (favorites.length === 0) loadDefaultRankings();
    }, [ano, favorites.length]);

    const handleDefaultCandidateClick = useCallback((candidate, cargo) => {
        if (!activeFav) {
            loadCandidateByNumber(candidate.numero, cargo);
        } else if (activeFav.cargo === cargo) {
            addCompareCandidate({ ...candidate, cargo });
        } else {
            loadCandidateByNumber(candidate.numero, cargo);
        }
    }, [activeFav, loadCandidateByNumber, addCompareCandidate]);

    if (!activeFav) {
        const cargoList = defaultRankings[defaultCargoTab] || [];
        return (
            <div className="sidebar">
                <div className="sidebar-default-header">
                    <Trophy size={18} />
                    <h3>Ranking Geral — {ano}</h3>
                </div>

                <div className="sidebar-cargo-tabs">
                    {DEFAULT_CARGOS.map(c => (
                        <button
                            key={c.key}
                            className={`sidebar-cargo-tab ${defaultCargoTab === c.key ? 'active' : ''}`}
                            onClick={() => setDefaultCargoTab(c.key)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>

                {isStateLevelTab && (
                    <div className="sidebar-uf-selector">
                        <MapPin size={12} />
                        <select
                            className="sidebar-uf-select"
                            value={selectedDefaultUf}
                            onChange={e => setSelectedDefaultUf(e.target.value)}
                        >
                            {UF_OPTIONS.map(uf => (
                                <option key={uf.sigla} value={uf.sigla}>{uf.nome}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="sidebar-default-list">
                    {defaultRankingsLoading && (
                        <div className="sidebar-loading">Carregando ranking...</div>
                    )}
                    {!defaultRankingsLoading && cargoList.length === 0 && (
                        <div className="sidebar-loading">Não tem dados disponíveis no momento</div>
                    )}
                    {cargoList.map((c, i) => {
                        const nome = c.nome?.split(' ')
                            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                            .join(' ');
                        return (
                            <button
                                key={c.numero}
                                className="sidebar-default-item"
                                onClick={() => handleDefaultCandidateClick(c, defaultCargoTab)}
                            >
                                <span className="sidebar-default-pos">{i + 1}º</span>
                                <div className="sidebar-default-info">
                                    <span className="sidebar-default-name">{nome}</span>
                                    <span className="sidebar-default-partido">{c.partido}</span>
                                </div>
                                <span className="sidebar-default-votes">
                                    {c.total_votos?.toLocaleString('pt-BR')}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <p className="sidebar-default-hint">
                    Clique em um candidato para ver seus dados detalhados
                </p>
            </div>
        );
    }

    return (
        <div className="sidebar">
            {/* Header */}
            <div className="sidebar-header">
                <div className="sidebar-header-color" style={{ background: CANDIDATE_COLORS[0] }} />
                <div>
                    <h2 className="sidebar-candidate-name">{activeFav.fullName}</h2>
                    <div className="sidebar-meta">
                        {selectedMunicipality && (
                            <span className="sidebar-meta-item">
                                <MapPin size={12} />
                                {selectedMunicipality}{selectedUf ? `, ${selectedUf}` : ''}
                            </span>
                        )}
                        {selectedUf && !selectedMunicipality && (
                            <span className="sidebar-meta-item">
                                <MapPin size={12} />
                                {selectedUf}
                            </span>
                        )}
                        <span className="sidebar-meta-item">{activeFav.cargo} · {activeFav.partido}</span>
                    </div>
                </div>
            </div>

            {isLoading && (
                <div className="sidebar-no-data">Carregando dados de {ano}...</div>
            )}

            {!isLoading && !hasData && (
                <div className="sidebar-no-data">
                    Sem dados disponíveis para {ano}.
                </div>
            )}

            <div className="sidebar-stats">
                {selectedMunicipality && (
                    <div className="sidebar-stat-card">
                        <span className="sidebar-stat-label">Votos no Município</span>
                        <span className="sidebar-stat-value">{currentVotes.toLocaleString('pt-BR')}</span>
                    </div>
                )}
                {rankingPosition && (
                    <div className="sidebar-stat-card accent">
                        <span className="sidebar-stat-label">Ranking Geral</span>
                        <div className="sidebar-stat-rank">
                            <Trophy size={16} />
                            <span className="sidebar-stat-value">{rankingPosition}º</span>
                        </div>
                        <span className="sidebar-stat-sub">de {activeFav.cargo}</span>
                    </div>
                )}
            </div>

            {!rankingLoading && comparativeRanking.length > 0 && (
                <div className="sidebar-section">
                    <h3 className="sidebar-section-title">
                        <BarChart3 size={14} />
                        {isComparing ? 'Comparativo' : `Ranking — ${activeFav.cargo}`}
                    </h3>
                    <div className="sidebar-ranking-list">
                        {comparativeRanking.map(c => {
                            const canCompare = !isComparing && !c.isActive && c.numero !== activeFav.numero;
                            const Tag = canCompare ? 'button' : 'div';
                            return (
                                <Tag
                                    key={c.numero}
                                    className={`sidebar-ranking-item ${c.isActive ? 'active' : ''} ${canCompare ? 'clickable' : ''}`}
                                    style={c.colorIdx >= 0 ? { borderLeft: `3px solid ${CANDIDATE_COLORS[c.colorIdx]}` } : {}}
                                    {...(canCompare ? { onClick: () => addCompareCandidate({ ...c, cargo: activeFav.cargo }) } : {})}
                                    {...(canCompare ? { title: 'Clique para comparar' } : {})}
                                >
                                    <span className="sidebar-ranking-pos">{c.position}º</span>
                                    <div className="sidebar-ranking-info">
                                        <span className="sidebar-ranking-name">{c.nome}</span>
                                        <span className="sidebar-ranking-partido">{c.partido}</span>
                                    </div>
                                    <span
                                        className="sidebar-ranking-votes"
                                        style={c.colorIdx >= 0 ? { color: CANDIDATE_COLORS[c.colorIdx] } : {}}
                                    >
                                        {c.total_votos?.toLocaleString('pt-BR')}
                                    </span>
                                </Tag>);
                        })}
                    </div>
                </div>
            )}
            {rankingLoading && <div className="sidebar-loading">Carregando ranking...</div>}

            {isComparing && rankingData && (() => {
                const pieData = [];
                const activeFavRank = rankingData.find(c => c.numero === activeFav.numero);
                if (activeFavRank) pieData.push({ label: activeFav.name, value: activeFavRank.total_votos || 0, colorIdx: 0 });
                compareCandidates.forEach((comp, i) => {
                    const compRank = rankingData.find(c => c.numero === comp.numero);
                    if (compRank) pieData.push({ label: comp.nome?.split(' ')[0], value: compRank.total_votos || 0, colorIdx: i + 1 });
                });
                return pieData.length > 1 ? (
                    <div className="sidebar-section">
                        <h3 className="sidebar-section-title"><BarChart3 size={14} /> Distribuição de Votos</h3>
                        <PieChart data={pieData} size={160} />
                    </div>
                ) : null;
            })()}

            <div className="sidebar-section">
                <h3 className="sidebar-section-title">
                    <Search size={14} />
                    Comparar com
                </h3>

                {compareCandidates.length > 0 && (
                    <div className="sidebar-compare-chips">
                        {compareCandidates.map((comp, i) => (
                            <div
                                key={comp.numero}
                                className="sidebar-compare-chip"
                                style={{ borderColor: CANDIDATE_COLORS[i + 1] }}
                            >
                                <span className="sidebar-compare-chip-dot" style={{ background: CANDIDATE_COLORS[i + 1] }} />
                                <span className="sidebar-compare-chip-name">{comp.nome?.split(' ')[0]}</span>
                                <span className="sidebar-compare-chip-meta">{comp.partido}</span>
                                <button className="sidebar-compare-chip-x" onClick={() => removeCompareCandidate(comp.numero)}>
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {history.length > 0 && !compareSearch && (
                    <div className="sidebar-history">
                        <span className="sidebar-history-label"><Clock size={10} /> Recentes</span>
                        <div className="sidebar-history-list">
                            {history.map(h => (
                                <button
                                    key={h.numero}
                                    className="sidebar-history-item"
                                    onClick={() => handleHistoryAdd(h)}
                                >
                                    <span>{h.nome?.split(' ')[0]}</span>
                                    <span className="sidebar-history-partido">{h.partido}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="sidebar-compare-search-wrapper">
                    <input
                        type="text"
                        className="sidebar-compare-input"
                        placeholder={`Buscar ${activeFav.cargo}...`}
                        value={compareSearch}
                        onChange={e => setCompareSearch(e.target.value)}
                    />
                    {compareResults.length > 0 && (
                        <div className="sidebar-compare-dropdown">
                            {compareResults.map((c, i) => {
                                const isInHistory = (history || []).some(h => h.numero === c.numero);
                                return (
                                    <button
                                        key={`${c.numero}-${i}`}
                                        className={`sidebar-compare-result ${isInHistory ? 'from-history' : ''}`}
                                        onClick={() => handleAddCompare(c)}
                                    >
                                        <span className="sidebar-compare-result-name">
                                            {isInHistory && <Clock size={10} style={{ marginRight: 4 }} />}
                                            {c.nome}
                                        </span>
                                        <span className="sidebar-compare-result-meta">{c.partido} · {c.total_votos?.toLocaleString('pt-BR')} votos</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {selectedMunicipality && (
                <button className="sidebar-secoes-btn" onClick={openSecoesModal}>
                    <Grid3x3 size={14} />
                    {isComparing ? 'Comparar Seções Eleitorais' : 'Seções Eleitorais'}
                </button>
            )}

            <button className="sidebar-export-btn" onClick={openExport}>
                <FileDown size={14} />
                {isComparing ? 'Comparar dados completos' : 'Ver dados completos'}
            </button>
        </div>
    );
}