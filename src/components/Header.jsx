import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { Radar, ChevronDown, Calendar } from 'lucide-react';

const ANOS_DISPONIVEIS = [2018, 2022]; // adicione anos conforme tiver DBs

export default function Header() {
    const candidateIndex = useStore(state => state.candidateIndex);
    const setCandidate = useStore(state => state.setCandidate);
    const candidates = useStore(state => state.candidates);
    const mode = useStore(state => state.mode);
    const setMode = useStore(state => state.setMode);
    const searchTimeout = useRef(null);

    const candidateList = useStore(state => state.candidateList);
    const loadCandidateList = useStore(state => state.loadCandidateList);
    const selectCandidateFromList = useStore(state => state.selectCandidateFromList);

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchNome, setSearchNome] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // const [searchNumero, setSearchNumero] = useState("");
    // const [searchCargo, setSearchCargo] = useState("Deputado Federal");
    const [searchError, setSearchError] = useState("");
    const loadCandidateByNumber = useStore(state => state.loadCandidateByNumber);

    const ano = useStore(state => state.ano);
    const setAno = useStore(state => state.setAno);

    const [anoDropdownOpen, setAnoDropdownOpen] = useState(false);
    const [confirmAno, setConfirmAno] = useState(null); // ano pendente de confirmação


    // const handleSearch = async () => {
    //     setSearchError("");
    //     const numero = parseInt(searchNumero);
    //     if (isNaN(numero)) {
    //         setSearchError("Informe um número válido");
    //         return;
    //     }

    //     try {
    //         await loadCandidateByNumber(numero, searchCargo);
    //         setDropdownOpen(false);
    //         setSearchNumero("");
    //     } catch (e) {
    //         setSearchError("Candidato não encontrado");
    //     }
    // };
    // Remover o state searchCargo e o <select>

    const handleSearchInput = (e) => {
        const val = e.target.value;
        setSearchNome(val);
        setSearchResults([]);
        setSearchError("");
        if (val.length < 3) return;

        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const res = await fetch(
                    `${API_URL}/candidatos/busca?ano=${ano}&nome=${encodeURIComponent(val)}`
                );
                const data = await res.json();
                setSearchResults(data);
            } catch {
                setSearchError("Erro ao buscar");
            } finally {
                setSearchLoading(false);
            }
        }, 400);
    };

    const handleSelectCandidate = async (numero, cargo) => {
        setSearchError("");
        try {
            await loadCandidateByNumber(numero, cargo);
            setDropdownOpen(false);
            setSearchNome("");
            setSearchResults([]);
        } catch {
            setSearchError("Erro ao carregar candidato");
        }
    };

    // Troca de ano — pede confirmação se já há candidatos carregados
    const handleAnoClick = (novoAno) => {
        if (novoAno === ano) { setAnoDropdownOpen(false); return; }
        if (candidates.length > 0) {
            setConfirmAno(novoAno); // mostra aviso
        } else {
            setAno(novoAno);
            setAnoDropdownOpen(false);
        }
    };

    const confirmarTrocaAno = () => {
        setAno(confirmAno);
        setConfirmAno(null);
        setAnoDropdownOpen(false);
    };

    return (
        <header className="fixed top-0 inset-x-0 h-14 bg-bg/80 backdrop-blur-md border-b border-border z-[1000] px-4 flex items-center justify-between">

            {/* LEFT: Branding */}
            <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center">
                    <div className="absolute w-2 h-2 rounded-full bg-accent opacity-75 animate-ping" />
                    <div className="relative w-2 h-2 rounded-full bg-accent" />
                    <Radar className="absolute text-accent w-5 h-5 opacity-20" />
                </div>
                <h1 className="font-display font-bold text-lg tracking-tight text-text ml-2">Radar Eleitoral</h1>
            </div>

            {/* CENTER: Candidates */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                {candidates.map((cand, idx) => {
                    const isActive = idx === candidateIndex;
                    return (
                        <button
                            key={idx}
                            onClick={() => setCandidate(idx)}
                            className={cn(
                                "px-4 py-1.5 rounded-full font-body text-sm font-medium transition-all duration-200 border",
                                isActive
                                    ? "bg-accent/20 border-accent/50 text-accent shadow-[0_0_10px_rgba(240,165,0,0.2)]"
                                    : "bg-surface2/50 border-transparent text-muted hover:text-text hover:bg-surface2"
                            )}
                        >
                            {cand.name}
                        </button>
                    );
                })}

                {/* Dropdown busca candidatos */}
                <div className="relative">
                    <button
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="px-4 py-1.5 rounded-full font-body text-sm font-medium transition-all duration-200 border bg-surface2/50 border-transparent text-muted hover:text-text hover:bg-surface2 flex items-center gap-1"
                    >
                        + Candidatos <ChevronDown className="w-4 h-4" />
                    </button>

                    {dropdownOpen && (
                        <div className="absolute top-full mt-2 right-0 w-80 max-h-[60vh] overflow-y-auto bg-surface border border-border rounded-lg shadow-xl flex flex-col p-2 z-50">
                            <div className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    value={searchNome}
                                    onChange={handleSearchInput}
                                    placeholder="Digite o nome do candidato..."
                                    className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-text text-sm"
                                    autoFocus
                                />
                                {searchLoading && (
                                    <span className="px-2 py-2 text-muted text-sm animate-pulse">...</span>
                                )}
                            </div>

                            {searchError && (
                                <div className="text-xs text-red-500 mb-2">{searchError}</div>
                            )}

                            {searchResults.length > 0 && (
                                <div className="flex flex-col mb-2 border border-border rounded-md overflow-hidden">
                                    <div className="px-3 py-1.5 bg-surface2/50 font-mono text-[10px] text-muted uppercase tracking-wider">
                                        Resultados ({searchResults.length})
                                    </div>
                                    {searchResults.map((c) => (
                                        <button
                                            key={`${c.numero}-${c.cargo}`}
                                            onClick={() => handleSelectCandidate(c.numero, c.cargo)}
                                            className="flex justify-between items-center px-3 py-2 text-sm text-text hover:bg-surface2 transition-colors w-full text-left"
                                        >
                                            <span>{c.nome.charAt(0) + c.nome.slice(1).toLowerCase()}</span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-mono text-[10px] text-muted">{c.cargo}</span>
                                                <span className="font-mono text-[11px] text-muted">#{c.numero}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="p-2 text-xs font-mono uppercase text-muted tracking-wider border-b border-border mb-1">
                                Candidatos carregados
                            </div>

                            {candidates.length === 0 ? (
                                <div className="p-3 text-sm text-muted text-center">Nenhum candidato carregado</div>
                            ) : (
                                candidates.map((c, idx) => (
                                    <div
                                        key={c.name + c.cargo}
                                        className="flex justify-between items-center text-sm text-text hover:bg-surface2 rounded-md transition-colors"
                                    >
                                        <button
                                            onClick={() => { setCandidate(idx); setDropdownOpen(false); }}
                                            className="flex-1 text-left px-3 py-2"
                                        >
                                            {c.fullName || c.name}
                                            <span className="ml-2 font-mono text-[10px] text-muted">{c.ano}</span>
                                        </button>
                                        <button
                                            onClick={() => useStore.getState().removeCandidate(idx)}
                                            className="px-2 py-1 text-xs text-red-500 hover:text-red-700"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Ano + Modes + Badge */}
            <div className="flex items-center gap-3">

                {/* ── Seletor de Ano ── */}
                <div className="relative">
                    <button
                        onClick={() => setAnoDropdownOpen(o => !o)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-[12px] font-semibold transition-all",
                            "bg-surface2/50 border-border text-text hover:border-accent/50 hover:text-accent"
                        )}
                    >
                        <Calendar className="w-3.5 h-3.5 text-muted" />
                        {ano}
                        <ChevronDown className={cn("w-3 h-3 text-muted transition-transform", anoDropdownOpen && "rotate-180")} />
                    </button>

                    {anoDropdownOpen && !confirmAno && (
                        <div className="absolute top-full mt-2 right-0 w-36 bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-50">
                            <div className="px-3 py-1.5 bg-surface2/50 font-mono text-[9px] uppercase tracking-wider text-muted">
                                Eleição
                            </div>
                            {ANOS_DISPONIVEIS.map(a => (
                                <button
                                    key={a}
                                    onClick={() => handleAnoClick(a)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 font-mono text-[12px] transition-colors",
                                        a === ano
                                            ? "text-accent bg-accent/10"
                                            : "text-text hover:bg-surface2"
                                    )}
                                >
                                    {a}
                                    {a === ano && <span className="text-[9px] text-accent">✓ ativo</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Modal de confirmação de troca de ano */}
                    {confirmAno && (
                        <div className="absolute top-full mt-2 right-0 w-64 bg-surface border border-amber-500/40 rounded-lg shadow-xl p-4 z-50 flex flex-col gap-3">
                            <p className="font-mono text-[11px] text-text leading-relaxed">
                                Trocar para <span className="text-accent font-bold">{confirmAno}</span> vai remover os {candidates.length} candidato(s) carregados.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={confirmarTrocaAno}
                                    className="flex-1 py-1.5 rounded-md bg-accent text-bg font-mono text-[11px] uppercase tracking-wider hover:bg-accent/80 transition-colors"
                                >
                                    Confirmar
                                </button>
                                <button
                                    onClick={() => setConfirmAno(null)}
                                    className="flex-1 py-1.5 rounded-md bg-surface2 text-muted font-mono text-[11px] uppercase tracking-wider hover:text-text transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modes */}
                <div className="flex items-center gap-1 bg-surface2/50 p-1 rounded-md border border-border">
                    {['heatmap', 'compare', 'heritage'].map((m) => {
                        const isActive = m === mode;
                        return (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={cn(
                                    "px-3 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-all",
                                    isActive
                                        ? "bg-surface border border-accent/40 text-accent shadow-sm"
                                        : "border border-transparent text-muted hover:text-text"
                                )}
                            >
                                {m}
                            </button>
                        );
                    })}
                </div>

                {/* Live badge */}
                <div className="flex items-center gap-2 border-l border-border pl-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                        TSE · Bahia {ano}
                    </span>
                </div>
            </div>

        </header>
    );
}