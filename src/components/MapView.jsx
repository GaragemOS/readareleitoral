import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { geoIdentity, geoPath } from 'd3-geo';
import { useStore, CANDIDATE_COLORS } from '../store';
import './MapView.css';

const TOPO_URL = 'https://gist.githubusercontent.com/ruliana/1ccaaab05ea113b0dff3b22be3b4d637/raw/br-states.json';
const IBGE_MUNI_BASE = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados';

const UF_NAMES = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
    CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
    MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
    PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia',
    RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

const UF_IBGE_CODE = {
    AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32,
    GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41,
    PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42,
    SP: 35, SE: 28, TO: 17
};

// Remove accents and normalize for consistent name matching
const normalizeName = (s) =>
    s?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim() || '';

function MapView() {
    const favorites = useStore(s => s.favorites);
    const activeFavoriteIndex = useStore(s => s.activeFavoriteIndex);
    const municipalData = useStore(s => s.municipalData);
    const selectedUf = useStore(s => s.selectedUf);
    const compareCandidates = useStore(s => s.compareCandidates);
    const compareData = useStore(s => s.compareData);
    const selectUf = useStore(s => s.selectUf);
    const clearUf = useStore(s => s.clearUf);
    const selectMunicipality = useStore(s => s.selectMunicipality);
    const openExport = useStore(s => s.openExport);

    const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0 });
    const [muniFeatures, setMuniFeatures] = useState(null);
    const [loadingMuni, setLoadingMuni] = useState(false);
    const [hoveredGeo, setHoveredGeo] = useState(null);
    // Fade-in control: false = invisible, true = visible
    const [muniVisible, setMuniVisible] = useState(false);

    // ── Optimized zoom via ref (no React re-renders) ──
    const svgRef = useRef(null);
    const scaleRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const wasDragRef = useRef(false);

    const activeFav = favorites[activeFavoriteIndex];
    const isComparing = compareCandidates.length > 0;

    // ── Build compare municipal lookup ────────────────
    const compareMuniData = useMemo(() => {
        const lookup = {};
        compareCandidates.forEach(comp => {
            const cData = compareData[comp.numero];
            if (cData?.por_municipio) {
                cData.por_municipio.forEach(m => {
                    const mName = m.NM_MUNICIPIO
                        .split(' ')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ');
                    if (!lookup[mName]) lookup[mName] = {};
                    lookup[mName][comp.numero] = m.total_votos;
                });
            }
        });
        return lookup;
    }, [compareCandidates, compareData]);

    // ── State-level data aggregation ──────────────────
    const ufVotes = useMemo(() => {
        const map = {};
        Object.entries(municipalData).forEach(([, mData]) => {
            const votes = mData.votes?.[activeFavoriteIndex] || 0;
            if (!map['BA']) map['BA'] = 0;
            map['BA'] += votes;
        });
        return map;
    }, [municipalData, activeFavoriteIndex]);

    // ── Municipal color scale (single candidate) ──────
    const { muniLookup, muniColorScale } = useMemo(() => {
        const lookup = {};
        Object.entries(municipalData).forEach(([mName, mData]) => {
            const v = mData.votes?.[activeFavoriteIndex] || 0;
            if (v > 0) lookup[normalizeName(mName)] = v;
        });
        const vals = Object.values(lookup).filter(v => v > 0);
        const maxV = vals.length > 0 ? Math.max(...vals) : 1;
        const colorScale = scaleLinear()
            .domain([0, maxV * 0.25, maxV * 0.5, maxV])
            .range(['#e0f2f1', '#4db6ac', '#00897b', '#004d40']);
        return { muniLookup: lookup, muniColorScale: colorScale };
    }, [municipalData, activeFavoriteIndex]);

    // ── State-level color scale ───────────────────────
    const stateColorScale = useMemo(() => {
        const vals = Object.values(ufVotes).filter(v => v > 0);
        const maxV = vals.length > 0 ? Math.max(...vals) : 1;
        return scaleLinear().domain([0, maxV * 0.5, maxV]).range(['#E6F7F7', '#66CDCC', '#285058']);
    }, [ufVotes]);

    // ── Get color for a municipality ──────────────────
    const getMuniColor = useCallback((nomeMuni) => {
        if (!isComparing) {
            const v = muniLookup[normalizeName(nomeMuni)] || 0;
            return v > 0 ? muniColorScale(v) : '#e8f5f3';
        }
        const favVotes = municipalData[nomeMuni]?.votes?.[activeFavoriteIndex] || 0;
        const compVotes = compareMuniData[nomeMuni] || {};
        let winner = { votes: favVotes, colorIdx: 0 };
        compareCandidates.forEach((comp, i) => {
            const v = compVotes[comp.numero] || 0;
            if (v > winner.votes) winner = { votes: v, colorIdx: i + 1 };
        });
        if (winner.votes === 0) return '#e8f5f3';
        return CANDIDATE_COLORS[winner.colorIdx] || CANDIDATE_COLORS[0];
    }, [isComparing, muniLookup, muniColorScale, municipalData, activeFavoriteIndex, compareMuniData, compareCandidates]);

    // ── Fetch municipal boundaries from IBGE ──────────
    useEffect(() => {
        if (!selectedUf) {
            setMuniFeatures(null);
            setMuniVisible(false);
            scaleRef.current = 1;
            panRef.current = { x: 0, y: 0 };
            if (svgRef.current) svgRef.current.style.transform = '';
            return;
        }
        const ibgeCode = UF_IBGE_CODE[selectedUf];
        if (!ibgeCode) return;
        setLoadingMuni(true);
        setMuniVisible(false); // hide while loading

        const geoUrl = `${IBGE_MUNI_BASE}/${ibgeCode}?intrarregiao=municipio&formato=application/vnd.geo+json`;
        const namesUrl = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ibgeCode}/municipios`;

        Promise.all([
            fetch(geoUrl).then(r => r.json()),
            fetch(namesUrl).then(r => r.json()),
        ]).then(([geoJson, municipios]) => {
            const codToName = {};
            if (Array.isArray(municipios)) municipios.forEach(m => { codToName[String(m.id)] = m.nome; });

            let features = [];
            if (geoJson?.features) features = geoJson.features;
            else if (geoJson?.type === 'Feature') features = [geoJson];

            features.forEach(f => {
                const cod = f.properties?.codarea;
                if (cod && codToName[String(cod)]) f.properties.nome = codToName[String(cod)];
            });
            setMuniFeatures(features);
            setLoadingMuni(false);
            // Small delay so browser paints the SVG before fading in
            requestAnimationFrame(() => setTimeout(() => setMuniVisible(true), 40));
        }).catch(err => {
            console.error('Erro ao carregar municípios:', err);
            setLoadingMuni(false);
        });
    }, [selectedUf]);

    // ── D3 path generator for municipalities ──────────
    const muniPathGen = useMemo(() => {
        if (!muniFeatures || muniFeatures.length === 0) return null;
        const fc = { type: 'FeatureCollection', features: muniFeatures };
        const proj = geoIdentity().reflectY(true).fitSize([700, 600], fc);
        return geoPath(proj);
    }, [muniFeatures]);

    // ── Apply transform to SVG (no React re-render) ───
    const applyTransform = useCallback(() => {
        if (!svgRef.current) return;
        const s = scaleRef.current;
        const p = panRef.current;
        svgRef.current.style.transform = `scale(${s}) translate(${p.x / s}px, ${p.y / s}px)`;
    }, []);

    // ── Tooltip ───────────────────────────────────────
    const buildTooltipContent = useCallback((label, nomeMuni) => {
        if (!isComparing) {
            const v = muniLookup[normalizeName(nomeMuni)] || 0;
            return `${label} — ${v.toLocaleString('pt-BR')} votos`;
        }
        const favVotes = municipalData[nomeMuni]?.votes?.[activeFavoriteIndex] || 0;
        const compVotes = compareMuniData[nomeMuni] || {};
        let parts = [`${activeFav?.name}: ${favVotes.toLocaleString('pt-BR')}`];
        compareCandidates.forEach(comp => {
            const v = compVotes[comp.numero] || 0;
            parts.push(`${comp.nome?.split(' ')[0]}: ${v.toLocaleString('pt-BR')}`);
        });
        return `${label}\n${parts.join(' · ')}`;
    }, [isComparing, muniLookup, municipalData, activeFavoriteIndex, compareMuniData, compareCandidates, activeFav]);

    const handleMouseEnter = useCallback((label, nomeMuni, evt) => {
        setTooltip({ show: true, content: buildTooltipContent(label, nomeMuni), x: evt.clientX, y: evt.clientY });
    }, [buildTooltipContent]);

    const handleMouseMove = useCallback((evt) => {
        setTooltip(prev => prev.show ? { ...prev, x: evt.clientX, y: evt.clientY } : prev);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setTooltip({ show: false, content: '', x: 0, y: 0 });
        setHoveredGeo(null);
    }, []);

    const handleStateClick = useCallback((geo) => {
        const uf = geo.properties.sigla || geo.properties.UF || geo.id;
        selectUf(uf);
    }, [selectUf]);

    const handleMuniClick = useCallback((name) => {
        if (!wasDragRef.current) selectMunicipality(name);
    }, [selectMunicipality]);

    // ── Wheel zoom (ref-based, no React re-render) ────
    const handleWheel = useCallback((e) => {
        if (!selectedUf) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        scaleRef.current = Math.max(1, Math.min(6, scaleRef.current + delta));
        applyTransform();
    }, [selectedUf, applyTransform]);

    // ── Drag handlers (ref-based) ─────────────────────
    const handleMouseDown = useCallback((e) => {
        if (!selectedUf || scaleRef.current <= 1) return;
        isDraggingRef.current = true;
        wasDragRef.current = false;
        dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }, [selectedUf]);

    const handleMouseMoveGlobal = useCallback((e) => {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragRef.current = true;
        panRef.current = { x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy };
        applyTransform();
    }, [applyTransform]);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
    }, []);

    const handleBack = useCallback(() => {
        clearUf();
        scaleRef.current = 1;
        panRef.current = { x: 0, y: 0 };
    }, [clearUf]);

    const hasFavorites = favorites.length > 0;

    return (
        <div
            className="map-wrapper"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMoveGlobal}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: selectedUf && scaleRef.current > 1 ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'default' }}
        >
            {selectedUf && (
                <button className="map-back-btn" onClick={handleBack}>← Voltar ao Brasil</button>
            )}

            {selectedUf && (
                <div className="map-state-badge">
                    {UF_NAMES[selectedUf]}
                    {ufVotes[selectedUf] ? ` — ${ufVotes[selectedUf].toLocaleString('pt-BR')} votos` : ''}
                </div>
            )}

            {loadingMuni && <div className="map-loading">Carregando municípios...</div>}

            {selectedUf && muniFeatures && muniPathGen ? (
                <svg
                    ref={svgRef}
                    viewBox="0 0 700 600"
                    className="map-svg-muni"
                    style={{
                        opacity: muniVisible ? 1 : 0,
                        transition: 'opacity 0.4s ease',
                    }}
                >
                    <g>
                        {muniFeatures.map((feature, idx) => {
                            const nomeMuni = feature.properties?.nome || `Município ${idx + 1}`;
                            const d = muniPathGen(feature);
                            if (!d) return null;
                            const isHovered = hoveredGeo === idx;
                            const fillColor = getMuniColor(nomeMuni);
                            return (
                                <path
                                    key={`muni-${idx}`}
                                    d={d}
                                    fill={isHovered ? '#14b8a6' : fillColor}
                                    stroke={isHovered ? '#0d9488' : '#94a3b8'}
                                    strokeWidth={isHovered ? 2 : 0.5}
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'fill 0.5s ease, stroke 0.2s ease, stroke-width 0.15s ease',
                                    }}
                                    onMouseEnter={(evt) => { setHoveredGeo(idx); handleMouseEnter(nomeMuni, nomeMuni, evt); }}
                                    onMouseMove={handleMouseMove}
                                    onMouseLeave={handleMouseLeave}
                                    onClick={() => handleMuniClick(nomeMuni)}
                                />
                            );
                        })}
                    </g>
                </svg>
            ) : (
                <ComposableMap
                    projection="geoMercator"
                    projectionConfig={{ scale: 650, center: [-54, -15] }}
                    width={500} height={480}
                    className="map-composable"
                >
                    <Geographies geography={TOPO_URL}>
                        {({ geographies }) =>
                            geographies.map(geo => {
                                const uf = geo.properties.sigla || geo.properties.UF || geo.id;
                                const valor = ufVotes[uf] || 0;
                                const isHovered = hoveredGeo === uf;
                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        fill={isHovered ? '#14b8a6' : (valor > 0 ? stateColorScale(valor) : '#E6F7F7')}
                                        stroke={isHovered ? '#0d9488' : '#cbd5e1'}
                                        strokeWidth={isHovered ? 1.5 : 0.6}
                                        style={{
                                            default: {
                                                outline: 'none',
                                                transition: 'fill 0.5s ease',
                                            },
                                            hover: {
                                                outline: 'none',
                                                cursor: 'pointer',
                                                transition: 'fill 0.15s ease',
                                            },
                                            pressed: { outline: 'none' },
                                        }}
                                        onMouseEnter={(evt) => {
                                            setHoveredGeo(uf);
                                            setTooltip({ show: true, content: `${UF_NAMES[uf] || uf} — ${valor.toLocaleString('pt-BR')} votos`, x: evt.clientX, y: evt.clientY });
                                        }}
                                        onMouseMove={handleMouseMove}
                                        onMouseLeave={handleMouseLeave}
                                        onClick={() => handleStateClick(geo)}
                                    />
                                );
                            })
                        }
                    </Geographies>
                </ComposableMap>
            )}

            {/* Comparison legend */}
            {isComparing && hasFavorites && (
                <div className="map-compare-legend">
                    <div className="map-compare-legend-item">
                        <span className="map-compare-dot" style={{ background: CANDIDATE_COLORS[0] }} />
                        <span>{activeFav?.name}</span>
                    </div>
                    {compareCandidates.map((comp, i) => (
                        <div key={comp.numero} className="map-compare-legend-item">
                            <span className="map-compare-dot" style={{ background: CANDIDATE_COLORS[i + 1] }} />
                            <span>{comp.nome?.split(' ')[0]}</span>
                        </div>
                    ))}
                </div>
            )}

            {!isComparing && hasFavorites && (
                <div className="map-legend">
                    <span>Menos</span>
                    <div className="map-legend-bar" style={{
                        background: selectedUf && muniFeatures
                            ? 'linear-gradient(to right, #e0f2f1, #4db6ac, #004d40)'
                            : 'linear-gradient(to right, #E6F7F7, #66CDCC, #285058)',
                    }} />
                    <span>Mais</span>
                </div>
            )}

            {hasFavorites && (
                <button className="map-vertudo-btn" onClick={openExport}>
                    {isComparing ? '📊 Ver tudo' : '📊 Ver tudo'}
                </button>
            )}

            {tooltip.show && (
                <div className="map-tooltip" style={{ top: tooltip.y - 44, left: tooltip.x + 14 }}>
                    {tooltip.content.split('\n').map((line, i) => (<div key={i}>{line}</div>))}
                </div>
            )}
        </div>
    );
}

export default memo(MapView);