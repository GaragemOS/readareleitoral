import { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Download, Filter, ChevronDown, Loader2,
    BarChart2, MapPin, Layers, FileText, AlertCircle,
    GitCompare, TrendingUp, TrendingDown, Minus, Users, Search
} from 'lucide-react';
import { cn } from '../lib/utils';

const API_URL = import.meta.env.API_URL || 'http://localhost:8000';
const ANOS_DISPONIVEIS = [2018, 2022];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n ?? 0).toLocaleString('pt-BR');

function Delta({ a, b }) {
    if (a == null || b == null || b === 0) return null;
    const diff = a - b;
    const diffPct = ((diff / b) * 100).toFixed(1);
    if (diff === 0) return <span className="flex items-center gap-0.5 text-muted font-mono text-[9px]"><Minus className="w-2.5 h-2.5" />0%</span>;
    return diff > 0
        ? <span className="flex items-center gap-0.5 text-green-400 font-mono text-[9px]"><TrendingUp className="w-2.5 h-2.5" />+{diffPct}%</span>
        : <span className="flex items-center gap-0.5 text-red-400 font-mono text-[9px]"><TrendingDown className="w-2.5 h-2.5" />{diffPct}%</span>;
}

function SelectFilter({ label, value, onChange, options, disabled }) {
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</span>
            <div className="relative">
                <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
                    className="w-full appearance-none bg-surface border border-border rounded-md px-3 py-1.5 pr-8 font-mono text-[12px] text-text focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
            </div>
        </div>
    );
}

function StatPill({ label, value, valueB, accent }) {
    const numA = typeof value === 'string' ? Number(value.replace(/\./g, '').replace(',', '.')) : Number(value);
    const numB = typeof valueB === 'string' ? Number(valueB.replace(/\./g, '').replace(',', '.')) : Number(valueB);
    return (
        <div className={cn("flex flex-col gap-0.5 rounded-lg px-3 py-2 border", accent ? "bg-accent/10 border-accent/30" : "bg-surface border-border")}>
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</span>
            <span className={cn("font-display text-base font-bold leading-none", accent ? "text-accent" : "text-text")}>{value}</span>
            {valueB !== undefined && (
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[10px] text-muted">{valueB}</span>
                    <Delta a={numA} b={numB} />
                </div>
            )}
        </div>
    );
}

function DataRow({ label, valueA, valueB, mono }) {
    return (
        <div className="flex items-center px-4 py-2 hover:bg-surface2/30 transition-colors gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted w-32 shrink-0">{label}</span>
            <span className={cn("flex-1 text-text text-[12px]", mono ? "font-mono" : "font-body")}>{valueA ?? '—'}</span>
            {valueB !== undefined && (
                <span className={cn("flex-1 text-muted text-[12px] border-l border-border/50 pl-3", mono ? "font-mono" : "font-body")}>{valueB ?? '—'}</span>
            )}
        </div>
    );
}

function TableSection({ title, icon: Icon, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-border rounded-lg overflow-hidden">
            <button onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-surface2/50 hover:bg-surface2 transition-colors">
                <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-accent" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-text font-semibold">{title}</span>
                </div>
                <ChevronDown className={cn("w-3 h-3 text-muted transition-transform duration-200", open && "rotate-180")} />
            </button>
            {open && <div className="divide-y divide-border/50">{children}</div>}
        </div>
    );
}

// ─── Hook: fetch candidato completo ───────────────────────────────────────────
function useCandidatoData(candidate, ano) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!candidate || !ano) { setData(null); return; }
        setLoading(true); setError(null); setData(null);
        fetch(`${API_URL}/candidato/completo?ano=${ano}&numero=${candidate.numero}&cargo=${encodeURIComponent(candidate.cargo)}`)
            .then(r => { if (!r.ok) throw new Error(`Erro ${r.status}`); return r.json(); })
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [candidate?.numero, candidate?.cargo, ano]);

    return { data, loading, error };
}

// ─── Painel de dados ──────────────────────────────────────────────────────────
function DataPanel({ data, loading, error, ano, activeTab,
    municipioFiltro, zonaFiltro, secaoFiltro, compareData }) {

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
            <span className="font-mono text-[10px] text-muted uppercase tracking-wider">Carregando {ano}...</span>
        </div>
    );
    if (error) return (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-mono text-[11px]">{error}</span>
        </div>
    );
    if (!data) return (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted">
            <span className="font-mono text-[11px]">Sem dados</span>
        </div>
    );

    const filteredMunicipios = data.por_municipio.filter(m => !municipioFiltro || m.NM_MUNICIPIO === municipioFiltro);
    const filteredZonas = data.por_zona.filter(z =>
        (!municipioFiltro || z.NM_MUNICIPIO === municipioFiltro) &&
        (!zonaFiltro || String(z.NR_ZONA) === zonaFiltro));
    const filteredSecoes = data.por_secao.filter(s =>
        (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro) &&
        (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro) &&
        (!secaoFiltro || String(s.NR_SECAO) === secaoFiltro));

    const cmpMun = (nm) => compareData?.por_municipio?.find(m => m.NM_MUNICIPIO === nm)?.total_votos;
    const cmpZona = (nm, z) => compareData?.por_zona?.find(r => r.NM_MUNICIPIO === nm && String(r.NR_ZONA) === String(z))?.total_votos;

    return (
        <>
            {activeTab === 'geral' && (
                <div className="p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2">
                        <StatPill label="Votos" value={fmt(data.totais.votos)}
                            valueB={compareData ? fmt(compareData.totais?.votos) : undefined} accent />
                        <StatPill label="Comparecimento" value={fmt(data.totais.comparecimento)}
                            valueB={compareData ? fmt(compareData.totais?.comparecimento) : undefined} />
                        <StatPill label="Aptos" value={fmt(data.totais.aptos)}
                            valueB={compareData ? fmt(compareData.totais?.aptos) : undefined} />
                        <StatPill label="Abstenções" value={fmt(data.totais.abstencoes)}
                            valueB={compareData ? fmt(compareData.totais?.abstencoes) : undefined} />
                    </div>
                    <TableSection title="Candidato" icon={FileText}>
                        <DataRow label="Nome" valueA={data.candidato.nome} />
                        <DataRow label="Número" valueA={data.candidato.numero} mono />
                        <DataRow label="UF" valueA={data.candidato.uf} mono />
                        <DataRow label="Cargo" valueA={data.candidato.cargo} />
                        <DataRow label="Tipo Votável" valueA={`${data.candidato.cd_tipo_votavel} – ${data.candidato.ds_tipo_votavel}`} mono />
                    </TableSection>
                    <TableSection title="Partido" icon={Layers}>
                        <DataRow label="Número" valueA={data.partido.numero} mono />
                        <DataRow label="Sigla" valueA={data.partido.sigla} mono />
                        <DataRow label="Nome" valueA={data.partido.nome} />
                    </TableSection>
                    <TableSection title="Eleição" icon={BarChart2}>
                        <DataRow label="Ano" valueA={data.eleicao.ano} mono />
                        <DataRow label="Turno" valueA={data.eleicao.nr_turno} mono />
                        <DataRow label="Tipo" valueA={data.eleicao.nm_tipo_eleicao} />
                        <DataRow label="Data Pleito" valueA={data.eleicao.dt_pleito} mono />
                        <DataRow label="Descrição" valueA={data.eleicao.ds_eleicao} />
                    </TableSection>
                </div>
            )}

            {activeTab === 'municipios' && (
                <div className="flex flex-col">
                    <div className="grid grid-cols-3 px-4 py-2 bg-surface2/50 sticky top-0 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
                        <span>Município</span><span className="text-right">Votos</span><span className="text-right">Δ</span>
                    </div>
                    {filteredMunicipios.length === 0 && <div className="text-center py-10 font-mono text-[11px] text-muted">Sem resultados</div>}
                    {filteredMunicipios.map((m, i) => (
                        <div key={i} className="grid grid-cols-3 px-4 py-2 font-mono text-[11px] text-text border-b border-border/40 hover:bg-surface2/30 transition-colors">
                            <span className="truncate text-muted text-[10px]">{m.NM_MUNICIPIO}</span>
                            <span className="text-right text-accent font-medium">{fmt(m.total_votos)}</span>
                            <span className="text-right flex justify-end">
                                {compareData && <Delta a={m.total_votos} b={cmpMun(m.NM_MUNICIPIO)} />}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'zonas' && (
                <div className="flex flex-col">
                    <div className="grid grid-cols-3 px-4 py-2 bg-surface2/50 sticky top-0 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
                        <span>Município</span><span className="text-center">Zona</span><span className="text-right">Votos</span>
                    </div>
                    {filteredZonas.map((z, i) => (
                        <div key={i} className="grid grid-cols-3 px-4 py-2 font-mono text-[11px] text-text border-b border-border/40 hover:bg-surface2/30 transition-colors">
                            <span className="truncate text-muted text-[10px]">{z.NM_MUNICIPIO}</span>
                            <span className="text-center text-muted">{z.NR_ZONA}</span>
                            <span className="text-right text-accent font-medium">{fmt(z.total_votos)}</span>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'secoes' && (
                <div className="flex flex-col">
                    <div className="grid grid-cols-4 px-4 py-2 bg-surface2/50 sticky top-0 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
                        <span>Município</span><span className="text-center">Zona</span><span className="text-center">Seção</span><span className="text-right">Votos</span>
                    </div>
                    {filteredSecoes.map((s, i) => (
                        <div key={i} className="grid grid-cols-4 px-4 py-2 font-mono text-[11px] text-text border-b border-border/40 hover:bg-surface2/30 transition-colors">
                            <span className="truncate text-muted text-[10px]">{s.NM_MUNICIPIO}</span>
                            <span className="text-center text-muted">{s.NR_ZONA}</span>
                            <span className="text-center">{s.NR_SECAO}</span>
                            <span className="text-right text-accent font-medium">{fmt(s.QT_VOTOS)}</span>
                        </div>
                    ))}
                    {secaoFiltro && filteredSecoes.length === 1 && (() => {
                        const s = filteredSecoes[0];
                        return (
                            <div className="m-3 border border-accent/30 rounded-lg bg-accent/5 p-3 flex flex-col gap-2">
                                <span className="font-mono text-[10px] uppercase tracking-wider text-accent font-semibold">Seção {s.NR_SECAO}</span>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                                    {[['Local', s.NR_LOCAL_VOTACAO], ['Tipo Urna', s.DS_TIPO_URNA],
                                    ['Nº Urna', s.NR_URNA_EFETIVADA], ['Abertura', s.DT_ABERTURA],
                                    ['Encerramento', s.DT_ENCERRAMENTO], ['Emissão BU', s.DT_EMISSAO_BU],
                                    ['Biometria NH', fmt(s.QT_ELEITORES_BIOMETRIA_NH)], ['Junta', s.NR_JUNTA_APURADORA],
                                    ].map(([l, v]) => (
                                        <div key={l} className="flex justify-between py-0.5">
                                            <span className="font-mono text-[9px] text-muted uppercase">{l}</span>
                                            <span className="font-mono text-[10px] text-text">{v ?? '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </>
    );
}

// ─── Busca de candidato para comparação ───────────────────────────────────────
function CandidateSearchDropdown({ ano, onSelect, onClose }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const timeout = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const search = (val) => {
        setQuery(val);
        setResults([]);
        if (val.length < 3) return;
        clearTimeout(timeout.current);
        timeout.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_URL}/candidatos/busca?ano=${ano}&nome=${encodeURIComponent(val)}`);
                const data = await res.json();
                setResults(data);
            } catch { }
            finally { setLoading(false); }
        }, 350);
    };

    return (
        <div className="absolute top-full mt-2 right-0 w-80 bg-surface border border-border rounded-xl shadow-2xl z-20 overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-surface2/50 border-b border-border flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted shrink-0" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => search(e.target.value)}
                    placeholder={`Buscar candidato em ${ano}...`}
                    className="flex-1 bg-transparent text-text text-sm font-mono focus:outline-none placeholder:text-muted"
                />
                {loading && <Loader2 className="w-3 h-3 text-muted animate-spin shrink-0" />}
                <button onClick={onClose} className="text-muted hover:text-text"><X className="w-3.5 h-3.5" /></button>
            </div>

            <div className="max-h-64 overflow-y-auto">
                {results.length === 0 && query.length >= 3 && !loading && (
                    <div className="px-4 py-6 text-center font-mono text-[11px] text-muted">Nenhum resultado</div>
                )}
                {query.length < 3 && (
                    <div className="px-4 py-4 text-center font-mono text-[10px] text-muted">Digite ao menos 3 caracteres</div>
                )}
                {results.map((c) => (
                    <button key={`${c.numero}-${c.cargo}`} onClick={() => onSelect(c)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface2 transition-colors gap-2 border-b border-border/30 last:border-0">
                        <div className="flex flex-col items-start min-w-0">
                            <span className="font-body text-sm text-text truncate">
                                {c.nome?.charAt(0).toUpperCase() + c.nome?.slice(1).toLowerCase()}
                            </span>
                            <span className="font-mono text-[10px] text-muted">{c.cargo}</span>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                            <span className="font-mono text-[11px] text-accent">#{c.numero}</span>
                            <span className="font-mono text-[10px] text-muted">{fmt(c.total_votos)} v</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Modal Principal ──────────────────────────────────────────────────────────
export default function ExportModal({ candidate, onClose }) {
    const [activeTab, setActiveTab] = useState('geral');
    const [municipioFiltro, setMunicipioFiltro] = useState('');
    const [zonaFiltro, setZonaFiltro] = useState('');
    const [secaoFiltro, setSecaoFiltro] = useState('');

    // ── Modo ano ──
    const [compareAno, setCompareAno] = useState(null);
    const [anoDropdown, setAnoDropdown] = useState(false);

    // ── Modo candidato ──
    const [compareCand, setCompareCand] = useState(null); // { numero, cargo, nome }
    const [candDropdown, setCandDropdown] = useState(false);

    const [anoAtual, setAnoAtual] = useState(candidate?.ano ?? 2022);
    const [anoADropdown, setAnoADropdown] = useState(false);
    const isCompAno = !!compareAno && !compareCand;
    const isCompCand = !!compareCand;
    const isComparing = isCompAno || isCompCand;

    // Painel B: ano de comparação ou mesmo candidato em outro candidato
    const panelBCandidate = isCompCand ? compareCand : (isCompAno ? candidate : null);
    const panelBAno = isCompCand ? anoAtual : (isCompAno ? compareAno : null);

    const { data, loading, error } = useCandidatoData(candidate, anoAtual);
    const { data: dataB, loading: loadingB, error: errorB } = useCandidatoData(panelBCandidate, panelBAno);

    const anosCompare = ANOS_DISPONIVEIS.filter(a => a !== anoAtual);

    const municipioOptions = data
        ? [{ value: '', label: 'Todos os municípios' },
        ...[...new Set(data.por_municipio.map(m => m.NM_MUNICIPIO))].sort().map(m => ({ value: m, label: m }))]
        : [{ value: '', label: 'Todos os municípios' }];

    const zonaOptions = data
        ? [{ value: '', label: 'Todas as zonas' },
        ...[...new Set(data.por_secao
            .filter(s => !municipioFiltro || s.NM_MUNICIPIO === municipioFiltro)
            .map(s => s.NR_ZONA))].sort((a, b) => a - b).map(z => ({ value: String(z), label: `Zona ${z}` }))]
        : [{ value: '', label: 'Todas as zonas' }];

    const secaoOptions = data
        ? [{ value: '', label: 'Todas as seções' },
        ...[...new Set(data.por_secao
            .filter(s => (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro) && (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro))
            .map(s => s.NR_SECAO))].sort((a, b) => a - b).map(s => ({ value: String(s), label: `Seção ${s}` }))]
        : [{ value: '', label: 'Todas as seções' }];

    const exportCSV = useCallback(() => {
        if (!data) return;
        const secoes = data.por_secao.filter(s =>
            (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro) &&
            (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro) &&
            (!secaoFiltro || String(s.NR_SECAO) === secaoFiltro));
        const rows = [
            ['Município', 'Zona', 'Seção', 'Votos', 'Aptos', 'Comparecimento', 'Tipo Urna'],
            ...secoes.map(s => [s.NM_MUNICIPIO, s.NR_ZONA, s.NR_SECAO, s.QT_VOTOS, s.QT_APTOS, s.QT_COMPARECIMENTO, s.DS_TIPO_URNA])
        ];
        const csv = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        a.download = `${candidate?.numero}_${anoAtual}.csv`;
        a.click();
    }, [data, municipioFiltro, zonaFiltro, secaoFiltro, candidate, anoAtual]);

    const clearCompare = () => { setCompareAno(null); setCompareCand(null); };

    const handleSelectCand = (c) => {
        setCompareCand({ numero: c.numero, cargo: c.cargo, nome: c.nome, ano: anoAtual });
        setCompareAno(null);
        setCandDropdown(false);
    };

    // Label do badge de comparação
    const compareLabel = isCompCand
        ? `vs ${compareCand.nome?.split(' ')[0]?.charAt(0).toUpperCase() + compareCand.nome?.split(' ')[0]?.slice(1).toLowerCase()}`
        : isCompAno
            ? `${anoAtual} vs ${compareAno}`
            : null;

    const tabs = [
        { id: 'geral', label: 'Geral', icon: FileText },
        { id: 'municipios', label: 'Municípios', icon: MapPin },
        { id: 'zonas', label: 'Zonas', icon: Layers },
        { id: 'secoes', label: 'Seções', icon: BarChart2 },
    ];

    const nomeCandidato = data?.candidato?.nome ?? candidate?.fullName ?? `#${candidate?.numero}`;

    // ── Painel B: header label ─────────────────────────────────────────────
    const panelBLabel = isCompCand
        ? `${compareCand.nome?.split(' ')[0]?.charAt(0).toUpperCase() + compareCand.nome?.split(' ')[0]?.slice(1).toLowerCase()} · ${anoAtual}`
        : `${compareAno}`;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={cn(
                "relative flex flex-col bg-bg border border-border rounded-2xl shadow-2xl overflow-hidden h-[90vh] transition-all duration-300",
                isComparing ? "w-full max-w-7xl" : "w-full max-w-4xl"
            )}>

                {/* ── Header ── */}
                <div className="flex-none px-6 py-4 border-b border-border bg-surface2/40 flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">Dados Completos</span>
                        <h2 className="font-display font-bold text-xl text-text leading-tight truncate">{nomeCandidato}</h2>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {data?.candidato && <>
                                <span className="font-mono text-[10px] text-muted">Nº {data.candidato.numero}</span>
                                <span className="text-muted text-xs">·</span>
                                <span className="font-mono text-[10px] text-muted uppercase">{data.candidato.cargo}</span>
                                <span className="text-muted text-xs">·</span>
                                <span className="font-mono text-[10px] text-muted">{data.partido?.sigla}</span>
                                <span className="text-muted text-xs">·</span>
                                <span className="font-mono text-[10px] text-accent">{anoAtual}</span>
                            </>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">

                        {/* ── Badge ativo de comparação ── */}
                        {isComparing && (
                            <button onClick={clearCompare}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all">
                                <GitCompare className="w-3.5 h-3.5" />
                                {compareLabel}
                                <X className="w-3 h-3" />
                            </button>
                        )}

                        {/* ── Botão: Trocar Ano do Painel A ── */}
                        <div className="relative">
                            <button onClick={() => { setAnoADropdown(o => !o); setAnoDropdown(false); setCandDropdown(false); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider border border-border bg-surface hover:border-accent/50 hover:text-accent text-muted transition-all">
                                <span className="text-accent font-bold">{anoAtual}</span>
                                <ChevronDown className={cn("w-3 h-3 transition-transform", anoADropdown && "rotate-180")} />
                            </button>
                            {anoADropdown && (
                                <div className="absolute top-full mt-2 right-0 w-36 bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-20">
                                    <div className="px-3 py-2 bg-surface2/50 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
                                        Ano do painel
                                    </div>
                                    {ANOS_DISPONIVEIS.map(a => (
                                        <button key={a} onClick={() => { setAnoAtual(a); setAnoADropdown(false); }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-4 py-2.5 font-mono text-[12px] transition-colors",
                                                a === anoAtual ? "text-accent bg-accent/10" : "text-text hover:bg-surface2"
                                            )}>
                                            {a}
                                            {a === anoAtual && <span className="text-[9px] text-accent">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Botão: Comparar Ano ── */}
                        {!isComparing && (
                            <div className="relative">
                                <button onClick={() => { setAnoDropdown(o => !o); setCandDropdown(false); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider border border-border bg-surface hover:border-accent/50 hover:text-accent text-muted transition-all">
                                    <GitCompare className="w-3.5 h-3.5" />
                                    Ano
                                    <ChevronDown className={cn("w-3 h-3 transition-transform", anoDropdown && "rotate-180")} />
                                </button>
                                {anoDropdown && (
                                    <div className="absolute top-full mt-2 right-0 w-44 bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-20">
                                        <div className="px-3 py-2 bg-surface2/50 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
                                            Comparar com ano
                                        </div>
                                        {anosCompare.map(a => (
                                            <button key={a} onClick={() => { setCompareAno(a); setAnoDropdown(false); }}
                                                className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-[12px] text-text hover:bg-surface2 transition-colors">
                                                <span>Eleição {a}</span>
                                                <span className="text-[10px] text-muted">mesmo cand.</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Botão: Comparar Candidato ── */}
                        {!isComparing && (
                            <div className="relative">
                                <button onClick={() => { setCandDropdown(o => !o); setAnoDropdown(false); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider border border-border bg-surface hover:border-purple-400/50 hover:text-purple-400 text-muted transition-all">
                                    <Users className="w-3.5 h-3.5" />
                                    Candidato
                                    <ChevronDown className={cn("w-3 h-3 transition-transform", candDropdown && "rotate-180")} />
                                </button>
                                {candDropdown && (
                                    <CandidateSearchDropdown
                                        ano={anoAtual}
                                        onSelect={handleSelectCand}
                                        onClose={() => setCandDropdown(false)}
                                    />
                                )}
                            </div>
                        )}

                        {/* ── CSV ── */}
                        <button onClick={exportCSV} disabled={!data}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider bg-accent text-bg hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                            <Download className="w-3.5 h-3.5" />
                            CSV
                        </button>

                        <button onClick={onClose}
                            className="text-muted hover:text-text hover:bg-surface2 p-1.5 rounded-full transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── Filtros ── */}
                {data && (
                    <div className="flex-none px-6 py-3 border-b border-border bg-bg flex items-end gap-3 flex-wrap">
                        <Filter className="w-3.5 h-3.5 text-muted mb-2 shrink-0" />
                        <div className="flex gap-3 flex-wrap flex-1">
                            <div className="flex-1 min-w-[160px]">
                                <SelectFilter label="Município" value={municipioFiltro}
                                    onChange={v => { setMunicipioFiltro(v); setZonaFiltro(''); setSecaoFiltro(''); }}
                                    options={municipioOptions} />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <SelectFilter label="Zona" value={zonaFiltro}
                                    onChange={v => { setZonaFiltro(v); setSecaoFiltro(''); }}
                                    options={zonaOptions} disabled={!municipioFiltro} />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <SelectFilter label="Seção" value={secaoFiltro}
                                    onChange={setSecaoFiltro}
                                    options={secaoOptions} disabled={!zonaFiltro} />
                            </div>
                        </div>
                        {(municipioFiltro || zonaFiltro || secaoFiltro) && (
                            <button onClick={() => { setMunicipioFiltro(''); setZonaFiltro(''); setSecaoFiltro(''); }}
                                className="font-mono text-[10px] text-muted hover:text-text underline underline-offset-2 mb-2 shrink-0">limpar</button>
                        )}
                    </div>
                )}

                {/* ── Tabs ── */}
                {data && (
                    <div className="flex-none px-6 border-b border-border bg-bg flex gap-1 overflow-x-auto">
                        {tabs.map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider border-b-2 -mb-px transition-colors whitespace-nowrap",
                                    activeTab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
                                )}>
                                <t.icon className="w-3 h-3" />
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Body: painéis ── */}
                <div className="flex-1 overflow-hidden flex">

                    {/* Painel A */}
                    <div className={cn("flex flex-col overflow-y-auto", isComparing ? "w-1/2 border-r border-border" : "w-full")}>
                        {isComparing && (
                            <div className="sticky top-0 z-10 px-4 py-2 bg-accent/10 border-b border-accent/20 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                                <span className="font-mono text-[11px] text-accent font-semibold uppercase tracking-wider truncate">
                                    {nomeCandidato.split(' ')[0]} · {anoAtual}
                                </span>
                                <span className="font-mono text-[10px] text-muted ml-auto shrink-0">
                                    {fmt(data?.totais?.votos)} votos
                                </span>
                            </div>
                        )}
                        <DataPanel data={data} loading={loading} error={error} ano={anoAtual}
                            activeTab={activeTab} municipioFiltro={municipioFiltro}
                            zonaFiltro={zonaFiltro} secaoFiltro={secaoFiltro}
                            compareData={dataB} />
                    </div>

                    {/* Painel B */}
                    {isComparing && (
                        <div className="w-1/2 flex flex-col overflow-y-auto">
                            <div className="sticky top-0 z-10 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                <span className="font-mono text-[11px] text-blue-400 font-semibold uppercase tracking-wider truncate">
                                    {panelBLabel}
                                </span>
                                <span className="font-mono text-[10px] text-muted ml-auto shrink-0">
                                    {loadingB ? '...' : `${fmt(dataB?.totais?.votos)} votos`}
                                </span>
                            </div>
                            <DataPanel data={dataB} loading={loadingB} error={errorB} ano={panelBAno}
                                activeTab={activeTab} municipioFiltro={municipioFiltro}
                                zonaFiltro={zonaFiltro} secaoFiltro={secaoFiltro} />
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                {data && (
                    <div className="flex-none px-6 py-2.5 border-t border-border bg-surface2/20 flex items-center justify-between gap-4">
                        <span className="font-mono text-[10px] text-muted">
                            {activeTab === 'municipios' && `${data.por_municipio.filter(m => !municipioFiltro || m.NM_MUNICIPIO === municipioFiltro).length} município(s)`}
                            {activeTab === 'zonas' && `${data.por_zona.filter(z => !municipioFiltro || z.NM_MUNICIPIO === municipioFiltro).length} zona(s)`}
                            {activeTab === 'secoes' && `${data.por_secao.filter(s => (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro) && (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro) && (!secaoFiltro || String(s.NR_SECAO) === secaoFiltro)).length} seção(ões)`}
                            {activeTab === 'geral' && 'Dados consolidados'}
                        </span>
                        {isComparing && dataB && (
                            <span className="font-mono text-[10px] text-blue-400 flex items-center gap-1.5">
                                <Delta a={data?.totais?.votos} b={dataB?.totais?.votos} />
                                <span className="text-muted">vs {panelBLabel}</span>
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
// import { useState, useEffect, useCallback } from 'react';
// import {
//     X, Download, Filter, ChevronDown, Loader2,
//     BarChart2, MapPin, Layers, FileText, AlertCircle,
//     GitCompare, TrendingUp, TrendingDown, Minus
// } from 'lucide-react';
// import { cn } from '../lib/utils';

// const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// const ANOS_DISPONIVEIS = [2018, 2022];

// // ─── Helpers ─────────────────────────────────────────────────────────────────
// const fmt = (n) => Number(n ?? 0).toLocaleString('pt-BR');
// const pct = (a, b) => (b && b !== 0) ? ((a / b) * 100).toFixed(1) + '%' : '—';

// function Delta({ a, b }) {
//     if (a == null || b == null || b === 0) return null;
//     const diff = a - b;
//     const diffPct = ((diff / b) * 100).toFixed(1);
//     if (diff === 0) return (
//         <span className="flex items-center gap-0.5 text-muted font-mono text-[9px]">
//             <Minus className="w-2.5 h-2.5" /> 0%
//         </span>
//     );
//     return diff > 0
//         ? <span className="flex items-center gap-0.5 text-green-400 font-mono text-[9px]"><TrendingUp className="w-2.5 h-2.5" />+{diffPct}%</span>
//         : <span className="flex items-center gap-0.5 text-red-400 font-mono text-[9px]"><TrendingDown className="w-2.5 h-2.5" />{diffPct}%</span>;
// }

// function SelectFilter({ label, value, onChange, options, disabled }) {
//     return (
//         <div className="flex flex-col gap-1 min-w-0">
//             <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</span>
//             <div className="relative">
//                 <select
//                     value={value}
//                     onChange={e => onChange(e.target.value)}
//                     disabled={disabled}
//                     className={cn(
//                         "w-full appearance-none bg-surface border border-border rounded-md px-3 py-1.5 pr-8",
//                         "font-mono text-[12px] text-text focus:outline-none focus:ring-1 focus:ring-accent/60",
//                         "disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
//                     )}
//                 >
//                     {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
//                 </select>
//                 <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
//             </div>
//         </div>
//     );
// }

// function StatPill({ label, value, valueB, accent }) {
//     return (
//         <div className={cn(
//             "flex flex-col gap-0.5 rounded-lg px-3 py-2 border",
//             accent ? "bg-accent/10 border-accent/30" : "bg-surface border-border"
//         )}>
//             <span className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</span>
//             <span className={cn("font-display text-base font-bold leading-none", accent ? "text-accent" : "text-text")}>{value}</span>
//             {valueB !== undefined && (
//                 <div className="flex items-center gap-1.5 mt-0.5">
//                     <span className="font-mono text-[10px] text-muted">{valueB}</span>
//                     <Delta a={Number(String(value).replace(/\./g, ''))} b={Number(String(valueB).replace(/\./g, ''))} />
//                 </div>
//             )}
//         </div>
//     );
// }

// function DataRow({ label, valueA, valueB, mono }) {
//     return (
//         <div className="flex items-center px-4 py-2 hover:bg-surface2/30 transition-colors gap-2">
//             <span className="font-mono text-[10px] uppercase tracking-wider text-muted w-36 shrink-0">{label}</span>
//             <span className={cn("flex-1 text-text text-[12px]", mono ? "font-mono" : "font-body")}>{valueA ?? '—'}</span>
//             {valueB !== undefined && (
//                 <span className={cn("flex-1 text-muted text-[12px] border-l border-border/50 pl-3", mono ? "font-mono" : "font-body")}>{valueB ?? '—'}</span>
//             )}
//         </div>
//     );
// }

// function TableSection({ title, icon: Icon, children, defaultOpen = true }) {
//     const [open, setOpen] = useState(defaultOpen);
//     return (
//         <div className="border border-border rounded-lg overflow-hidden">
//             <button onClick={() => setOpen(o => !o)}
//                 className="w-full flex items-center justify-between px-4 py-2.5 bg-surface2/50 hover:bg-surface2 transition-colors">
//                 <div className="flex items-center gap-2">
//                     <Icon className="w-3.5 h-3.5 text-accent" />
//                     <span className="font-mono text-[11px] uppercase tracking-wider text-text font-semibold">{title}</span>
//                 </div>
//                 <ChevronDown className={cn("w-3 h-3 text-muted transition-transform duration-200", open && "rotate-180")} />
//             </button>
//             {open && <div className="divide-y divide-border/50">{children}</div>}
//         </div>
//     );
// }

// // ─── Hook: fetch candidato completo ──────────────────────────────────────────
// function useCandidatoData(candidate, ano) {
//     const [data, setData] = useState(null);
//     const [loading, setLoading] = useState(false);
//     const [error, setError] = useState(null);

//     useEffect(() => {
//         if (!candidate || !ano) return;
//         setLoading(true); setError(null); setData(null);
//         fetch(`${API_URL}/candidato/completo?ano=${ano}&numero=${candidate.numero}&cargo=${encodeURIComponent(candidate.cargo)}`)
//             .then(r => { if (!r.ok) throw new Error(`Erro ${r.status}`); return r.json(); })
//             .then(d => { setData(d); setLoading(false); })
//             .catch(e => { setError(e.message); setLoading(false); });
//     }, [candidate?.numero, candidate?.cargo, ano]);

//     return { data, loading, error };
// }

// // ─── Painel individual ────────────────────────────────────────────────────────
// function DataPanel({ data, loading, error, ano, label, accentColor,
//     activeTab, municipioFiltro, zonaFiltro, secaoFiltro, compareData }) {

//     if (loading) return (
//         <div className="flex flex-col items-center justify-center h-64 gap-3">
//             <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
//             <span className="font-mono text-[10px] text-muted uppercase tracking-wider">Carregando {ano}...</span>
//         </div>
//     );

//     if (error) return (
//         <div className="flex flex-col items-center justify-center h-64 gap-2 text-red-400">
//             <AlertCircle className="w-5 h-5" />
//             <span className="font-mono text-[11px]">{error}</span>
//         </div>
//     );

//     if (!data) return null;

//     const filteredMunicipios = data.por_municipio.filter(m =>
//         !municipioFiltro || m.NM_MUNICIPIO === municipioFiltro);

//     const filteredZonas = data.por_zona.filter(z =>
//         (!municipioFiltro || z.NM_MUNICIPIO === municipioFiltro) &&
//         (!zonaFiltro || String(z.NR_ZONA) === zonaFiltro));

//     const filteredSecoes = data.por_secao.filter(s =>
//         (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro) &&
//         (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro) &&
//         (!secaoFiltro || String(s.NR_SECAO) === secaoFiltro));

//     const isCompare = !!compareData;

//     // helper para encontrar valor do outro painel por município/zona
//     const cmpMun = (nm) => compareData?.por_municipio?.find(m => m.NM_MUNICIPIO === nm)?.total_votos;
//     const cmpZona = (nm, z) => compareData?.por_zona?.find(r => r.NM_MUNICIPIO === nm && String(r.NR_ZONA) === String(z))?.total_votos;

//     return (
//         <div className="flex flex-col gap-0 flex-1 min-w-0">

//             {/* Tab: Geral */}
//             {activeTab === 'geral' && (
//                 <div className="p-4 flex flex-col gap-4">
//                     <div className="grid grid-cols-2 gap-2">
//                         <StatPill label="Votos" value={fmt(data.totais.votos)}
//                             valueB={isCompare ? fmt(compareData?.totais?.votos) : undefined} accent />
//                         <StatPill label="Comparecimento" value={fmt(data.totais.comparecimento)}
//                             valueB={isCompare ? fmt(compareData?.totais?.comparecimento) : undefined} />
//                         <StatPill label="Aptos" value={fmt(data.totais.aptos)}
//                             valueB={isCompare ? fmt(compareData?.totais?.aptos) : undefined} />
//                         <StatPill label="Abstenções" value={fmt(data.totais.abstencoes)}
//                             valueB={isCompare ? fmt(compareData?.totais?.abstencoes) : undefined} />
//                     </div>

//                     <TableSection title="Candidato" icon={FileText}>
//                         <DataRow label="Nome" valueA={data.candidato.nome} />
//                         <DataRow label="Número" valueA={data.candidato.numero} mono />
//                         <DataRow label="UF" valueA={data.candidato.uf} mono />
//                         <DataRow label="Cargo" valueA={data.candidato.cargo} />
//                         <DataRow label="Tipo Votável" valueA={`${data.candidato.cd_tipo_votavel} – ${data.candidato.ds_tipo_votavel}`} mono />
//                     </TableSection>

//                     <TableSection title="Partido" icon={Layers}>
//                         <DataRow label="Número" valueA={data.partido.numero} mono />
//                         <DataRow label="Sigla" valueA={data.partido.sigla} mono />
//                         <DataRow label="Nome" valueA={data.partido.nome} />
//                     </TableSection>

//                     <TableSection title="Eleição" icon={BarChart2}>
//                         <DataRow label="Ano" valueA={data.eleicao.ano} mono />
//                         <DataRow label="Turno" valueA={data.eleicao.nr_turno} mono />
//                         <DataRow label="Tipo" valueA={data.eleicao.nm_tipo_eleicao} />
//                         <DataRow label="Data Pleito" valueA={data.eleicao.dt_pleito} mono />
//                         <DataRow label="Descrição" valueA={data.eleicao.ds_eleicao} />
//                     </TableSection>
//                 </div>
//             )}

//             {/* Tab: Municípios */}
//             {activeTab === 'municipios' && (
//                 <div className="flex flex-col">
//                     <div className="grid grid-cols-3 px-4 py-2 bg-surface2/50 sticky top-0 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
//                         <span className="col-span-1">Município</span>
//                         <span className="text-right">Votos</span>
//                         <span className="text-right">Δ</span>
//                     </div>
//                     {filteredMunicipios.length === 0 && (
//                         <div className="text-center py-10 font-mono text-[11px] text-muted">Sem resultados</div>
//                     )}
//                     {filteredMunicipios.map((m, i) => {
//                         const other = cmpMun(m.NM_MUNICIPIO);
//                         return (
//                             <div key={i} className="grid grid-cols-3 px-4 py-2 font-mono text-[11px] text-text border-b border-border/40 hover:bg-surface2/30 transition-colors">
//                                 <span className="truncate text-muted text-[10px]">{m.NM_MUNICIPIO}</span>
//                                 <span className="text-right text-accent font-medium">{fmt(m.total_votos)}</span>
//                                 <span className="text-right flex justify-end">
//                                     {isCompare && <Delta a={m.total_votos} b={other} />}
//                                 </span>
//                             </div>
//                         );
//                     })}
//                 </div>
//             )}

//             {/* Tab: Zonas */}
//             {activeTab === 'zonas' && (
//                 <div className="flex flex-col">
//                     <div className="grid grid-cols-3 px-4 py-2 bg-surface2/50 sticky top-0 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
//                         <span>Município</span>
//                         <span className="text-center">Zona</span>
//                         <span className="text-right">Votos</span>
//                     </div>
//                     {filteredZonas.map((z, i) => (
//                         <div key={i} className="grid grid-cols-3 px-4 py-2 font-mono text-[11px] text-text border-b border-border/40 hover:bg-surface2/30 transition-colors">
//                             <span className="truncate text-muted text-[10px]">{z.NM_MUNICIPIO}</span>
//                             <span className="text-center text-muted">{z.NR_ZONA}</span>
//                             <span className="text-right text-accent font-medium">{fmt(z.total_votos)}</span>
//                         </div>
//                     ))}
//                 </div>
//             )}

//             {/* Tab: Seções */}
//             {activeTab === 'secoes' && (
//                 <div className="flex flex-col">
//                     <div className="grid grid-cols-4 px-4 py-2 bg-surface2/50 sticky top-0 font-mono text-[9px] uppercase tracking-wider text-muted border-b border-border">
//                         <span>Município</span>
//                         <span className="text-center">Zona</span>
//                         <span className="text-center">Seção</span>
//                         <span className="text-right">Votos</span>
//                     </div>
//                     {filteredSecoes.map((s, i) => (
//                         <div key={i} className="grid grid-cols-4 px-4 py-2 font-mono text-[11px] text-text border-b border-border/40 hover:bg-surface2/30 transition-colors">
//                             <span className="truncate text-muted text-[10px]">{s.NM_MUNICIPIO}</span>
//                             <span className="text-center text-muted">{s.NR_ZONA}</span>
//                             <span className="text-center">{s.NR_SECAO}</span>
//                             <span className="text-right text-accent font-medium">{fmt(s.QT_VOTOS)}</span>
//                         </div>
//                     ))}
//                     {/* Detalhe seção única */}
//                     {secaoFiltro && filteredSecoes.length === 1 && (() => {
//                         const s = filteredSecoes[0];
//                         return (
//                             <div className="m-3 border border-accent/30 rounded-lg bg-accent/5 p-3 flex flex-col gap-2">
//                                 <span className="font-mono text-[10px] uppercase tracking-wider text-accent font-semibold">Seção {s.NR_SECAO}</span>
//                                 <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
//                                     {[
//                                         ['Local', s.NR_LOCAL_VOTACAO],
//                                         ['Tipo Urna', s.DS_TIPO_URNA],
//                                         ['Nº Urna', s.NR_URNA_EFETIVADA],
//                                         ['Abertura', s.DT_ABERTURA],
//                                         ['Encerramento', s.DT_ENCERRAMENTO],
//                                         ['Emissão BU', s.DT_EMISSAO_BU],
//                                         ['Biometria NH', fmt(s.QT_ELEITORES_BIOMETRIA_NH)],
//                                         ['Junta', s.NR_JUNTA_APURADORA],
//                                     ].map(([l, v]) => (
//                                         <div key={l} className="flex justify-between py-0.5">
//                                             <span className="font-mono text-[9px] text-muted uppercase">{l}</span>
//                                             <span className="font-mono text-[10px] text-text">{v ?? '—'}</span>
//                                         </div>
//                                     ))}
//                                 </div>
//                             </div>
//                         );
//                     })()}
//                 </div>
//             )}
//         </div>
//     );
// }

// // ─── Modal Principal ──────────────────────────────────────────────────────────
// export default function ExportModal({ candidate, onClose }) {
//     const [activeTab, setActiveTab] = useState('geral');
//     const [municipioFiltro, setMunicipioFiltro] = useState('');
//     const [zonaFiltro, setZonaFiltro] = useState('');
//     const [secaoFiltro, setSecaoFiltro] = useState('');
//     const [compareAno, setCompareAno] = useState(null);
//     const [compareDropdown, setCompareDropdown] = useState(false);

//     const anoAtual = candidate?.ano ?? 2022;

//     const { data, loading, error } = useCandidatoData(candidate, anoAtual);
//     const { data: dataB, loading: loadingB, error: errorB } = useCandidatoData(
//         compareAno ? candidate : null, compareAno
//     );

//     const isComparing = !!compareAno;

//     // Anos disponíveis para comparação (todos exceto o atual)
//     const anosCompare = ANOS_DISPONIVEIS.filter(a => a !== anoAtual);

//     // Opções de filtro derivadas do painel principal
//     const municipioOptions = data
//         ? [{ value: '', label: 'Todos os municípios' },
//         ...[...new Set(data.por_municipio.map(m => m.NM_MUNICIPIO))].sort()
//             .map(m => ({ value: m, label: m }))]
//         : [{ value: '', label: 'Todos os municípios' }];

//     const zonaOptions = data
//         ? [{ value: '', label: 'Todas as zonas' },
//         ...[...new Set(
//             data.por_secao
//                 .filter(s => !municipioFiltro || s.NM_MUNICIPIO === municipioFiltro)
//                 .map(s => s.NR_ZONA)
//         )].sort((a, b) => a - b).map(z => ({ value: String(z), label: `Zona ${z}` }))]
//         : [{ value: '', label: 'Todas as zonas' }];

//     const secaoOptions = data
//         ? [{ value: '', label: 'Todas as seções' },
//         ...[...new Set(
//             data.por_secao
//                 .filter(s => (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro)
//                     && (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro))
//                 .map(s => s.NR_SECAO)
//         )].sort((a, b) => a - b).map(s => ({ value: String(s), label: `Seção ${s}` }))]
//         : [{ value: '', label: 'Todas as seções' }];

//     // CSV export
//     const exportCSV = useCallback(() => {
//         if (!data) return;
//         const secoes = data.por_secao.filter(s =>
//             (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro) &&
//             (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro) &&
//             (!secaoFiltro || String(s.NR_SECAO) === secaoFiltro));
//         const rows = [
//             ['Município', 'Zona', 'Seção', 'Local', 'Votos', 'Aptos', 'Comparecimento', 'Abstenções', 'Tipo Urna', 'Abertura', 'Encerramento'],
//             ...secoes.map(s => [s.NM_MUNICIPIO, s.NR_ZONA, s.NR_SECAO, s.NR_LOCAL_VOTACAO,
//             s.QT_VOTOS, s.QT_APTOS, s.QT_COMPARECIMENTO, s.QT_ABSTENCOES,
//             s.DS_TIPO_URNA, s.DT_ABERTURA, s.DT_ENCERRAMENTO])
//         ];
//         const csv = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
//         const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
//         const a = document.createElement('a');
//         a.href = URL.createObjectURL(blob);
//         a.download = `${candidate?.numero}_${anoAtual}.csv`;
//         a.click();
//     }, [data, municipioFiltro, zonaFiltro, secaoFiltro, candidate, anoAtual]);

//     const tabs = [
//         { id: 'geral', label: 'Geral', icon: FileText },
//         { id: 'municipios', label: 'Municípios', icon: MapPin },
//         { id: 'zonas', label: 'Zonas', icon: Layers },
//         { id: 'secoes', label: 'Seções', icon: BarChart2 },
//     ];

//     const nomeCandidato = data?.candidato?.nome ?? candidate?.fullName ?? `#${candidate?.numero}`;

//     return (
//         <div
//             className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
//             onClick={e => { if (e.target === e.currentTarget) onClose(); }}
//         >
//             <div className={cn(
//                 "relative flex flex-col bg-bg border border-border rounded-2xl shadow-2xl overflow-hidden h-[90vh] transition-all duration-300",
//                 isComparing ? "w-full max-w-7xl" : "w-full max-w-4xl"
//             )}>

//                 {/* ── Header ── */}
//                 <div className="flex-none px-6 py-4 border-b border-border bg-surface2/40 flex items-start justify-between gap-4">
//                     <div className="flex flex-col gap-0.5 min-w-0">
//                         <span className="font-mono text-[10px] uppercase tracking-widest text-accent">Dados Completos</span>
//                         <h2 className="font-display font-bold text-xl text-text leading-tight truncate">{nomeCandidato}</h2>
//                         <div className="flex items-center gap-2 flex-wrap mt-0.5">
//                             {data?.candidato && <>
//                                 <span className="font-mono text-[10px] text-muted">Nº {data.candidato.numero}</span>
//                                 <span className="text-muted">·</span>
//                                 <span className="font-mono text-[10px] text-muted uppercase">{data.candidato.cargo}</span>
//                                 <span className="text-muted">·</span>
//                                 <span className="font-mono text-[10px] text-muted">{data.partido?.sigla}</span>
//                             </>}
//                         </div>
//                     </div>

//                     <div className="flex items-center gap-2 shrink-0">
//                         {/* Botão Compare */}
//                         <div className="relative">
//                             {!isComparing ? (
//                                 <button
//                                     onClick={() => setCompareDropdown(o => !o)}
//                                     className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider border border-border bg-surface hover:border-accent/50 hover:text-accent text-muted transition-all"
//                                 >
//                                     <GitCompare className="w-3.5 h-3.5" />
//                                     Comparar
//                                     <ChevronDown className={cn("w-3 h-3 transition-transform", compareDropdown && "rotate-180")} />
//                                 </button>
//                             ) : (
//                                 <button
//                                     onClick={() => { setCompareAno(null); setCompareDropdown(false); }}
//                                     className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-all"
//                                 >
//                                     <GitCompare className="w-3.5 h-3.5" />
//                                     {anoAtual} vs {compareAno}
//                                     <X className="w-3 h-3" />
//                                 </button>
//                             )}

//                             {compareDropdown && !isComparing && (
//                                 <div className="absolute top-full mt-2 right-0 w-48 bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-10">
//                                     <div className="px-3 py-2 bg-surface2/50 font-mono text-[9px] uppercase tracking-wider text-muted">
//                                         Comparar com
//                                     </div>
//                                     {anosCompare.map(a => (
//                                         <button
//                                             key={a}
//                                             onClick={() => { setCompareAno(a); setCompareDropdown(false); }}
//                                             className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-[12px] text-text hover:bg-surface2 transition-colors"
//                                         >
//                                             <span>Eleição {a}</span>
//                                             <span className="text-[10px] text-muted">mesmo candidato</span>
//                                         </button>
//                                     ))}
//                                 </div>
//                             )}
//                         </div>

//                         <button onClick={exportCSV} disabled={!data}
//                             className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider bg-accent text-bg hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
//                             <Download className="w-3.5 h-3.5" />
//                             CSV
//                         </button>
//                         <button onClick={onClose}
//                             className="text-muted hover:text-text hover:bg-surface2 p-1.5 rounded-full transition-colors">
//                             <X className="w-4 h-4" />
//                         </button>
//                     </div>
//                 </div>

//                 {/* ── Filtros ── */}
//                 {data && (
//                     <div className="flex-none px-6 py-3 border-b border-border bg-bg flex items-end gap-3 flex-wrap">
//                         <Filter className="w-3.5 h-3.5 text-muted mb-2 shrink-0" />
//                         <div className="flex gap-3 flex-wrap flex-1">
//                             <div className="flex-1 min-w-[160px]">
//                                 <SelectFilter label="Município" value={municipioFiltro}
//                                     onChange={v => { setMunicipioFiltro(v); setZonaFiltro(''); setSecaoFiltro(''); }}
//                                     options={municipioOptions} />
//                             </div>
//                             <div className="flex-1 min-w-[120px]">
//                                 <SelectFilter label="Zona" value={zonaFiltro}
//                                     onChange={v => { setZonaFiltro(v); setSecaoFiltro(''); }}
//                                     options={zonaOptions} disabled={!municipioFiltro} />
//                             </div>
//                             <div className="flex-1 min-w-[120px]">
//                                 <SelectFilter label="Seção" value={secaoFiltro}
//                                     onChange={setSecaoFiltro}
//                                     options={secaoOptions} disabled={!zonaFiltro} />
//                             </div>
//                         </div>
//                         {(municipioFiltro || zonaFiltro || secaoFiltro) && (
//                             <button onClick={() => { setMunicipioFiltro(''); setZonaFiltro(''); setSecaoFiltro(''); }}
//                                 className="font-mono text-[10px] text-muted hover:text-text underline underline-offset-2 mb-2 shrink-0">
//                                 limpar
//                             </button>
//                         )}
//                     </div>
//                 )}

//                 {/* ── Tabs ── */}
//                 {data && (
//                     <div className="flex-none px-6 border-b border-border bg-bg flex gap-1 overflow-x-auto">
//                         {tabs.map(t => (
//                             <button key={t.id} onClick={() => setActiveTab(t.id)}
//                                 className={cn(
//                                     "flex items-center gap-1.5 px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider border-b-2 -mb-px transition-colors whitespace-nowrap",
//                                     activeTab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
//                                 )}>
//                                 <t.icon className="w-3 h-3" />
//                                 {t.label}
//                             </button>
//                         ))}
//                     </div>
//                 )}

//                 {/* ── Body: painéis lado a lado ── */}
//                 <div className="flex-1 overflow-hidden flex">

//                     {/* Painel A — ano atual */}
//                     <div className={cn(
//                         "flex flex-col overflow-y-auto",
//                         isComparing ? "w-1/2 border-r border-border" : "w-full"
//                     )}>
//                         {isComparing && (
//                             <div className="sticky top-0 z-10 px-4 py-2 bg-accent/10 border-b border-accent/20 flex items-center gap-2">
//                                 <div className="w-1.5 h-1.5 rounded-full bg-accent" />
//                                 <span className="font-mono text-[11px] text-accent font-semibold uppercase tracking-wider">
//                                     {anoAtual}
//                                 </span>
//                                 <span className="font-mono text-[10px] text-muted ml-auto">
//                                     {fmt(data?.totais?.votos)} votos
//                                 </span>
//                             </div>
//                         )}
//                         <DataPanel
//                             data={data} loading={loading} error={error}
//                             ano={anoAtual} accentColor="var(--color-accent)"
//                             activeTab={activeTab}
//                             municipioFiltro={municipioFiltro}
//                             zonaFiltro={zonaFiltro}
//                             secaoFiltro={secaoFiltro}
//                             compareData={dataB}
//                         />
//                     </div>

//                     {/* Painel B — ano de comparação */}
//                     {isComparing && (
//                         <div className="w-1/2 flex flex-col overflow-y-auto">
//                             <div className="sticky top-0 z-10 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-2">
//                                 <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
//                                 <span className="font-mono text-[11px] text-blue-400 font-semibold uppercase tracking-wider">
//                                     {compareAno}
//                                 </span>
//                                 <span className="font-mono text-[10px] text-muted ml-auto">
//                                     {loadingB ? '...' : fmt(dataB?.totais?.votos)} votos
//                                 </span>
//                             </div>
//                             <DataPanel
//                                 data={dataB} loading={loadingB} error={errorB}
//                                 ano={compareAno} accentColor="#60a5fa"
//                                 activeTab={activeTab}
//                                 municipioFiltro={municipioFiltro}
//                                 zonaFiltro={zonaFiltro}
//                                 secaoFiltro={secaoFiltro}
//                             />
//                         </div>
//                     )}
//                 </div>

//                 {/* ── Footer ── */}
//                 {data && (
//                     <div className="flex-none px-6 py-2.5 border-t border-border bg-surface2/20 flex items-center justify-between gap-4">
//                         <span className="font-mono text-[10px] text-muted">
//                             {activeTab === 'municipios' && `${data.por_municipio.filter(m => !municipioFiltro || m.NM_MUNICIPIO === municipioFiltro).length} município(s)`}
//                             {activeTab === 'zonas' && `${data.por_zona.filter(z => !municipioFiltro || z.NM_MUNICIPIO === municipioFiltro).length} zona(s)`}
//                             {activeTab === 'secoes' && `${data.por_secao.filter(s => (!municipioFiltro || s.NM_MUNICIPIO === municipioFiltro) && (!zonaFiltro || String(s.NR_ZONA) === zonaFiltro) && (!secaoFiltro || String(s.NR_SECAO) === secaoFiltro)).length} seção(ões)`}
//                             {activeTab === 'geral' && 'Dados consolidados'}
//                         </span>
//                         {isComparing && dataB && (
//                             <span className="font-mono text-[10px] text-blue-400 flex items-center gap-1.5">
//                                 <Delta a={data?.totais?.votos} b={dataB?.totais?.votos} />
//                                 <span className="text-muted">vs {compareAno}</span>
//                             </span>
//                         )}
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// }