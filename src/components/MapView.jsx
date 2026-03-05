import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';

const GEOJSON_URL = "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-29-mun.json";

// Paleta de cores para candidatos no modo compare
const CANDIDATE_COLORS = [
    '#3b82f6', // azul
    '#ef4444', // vermelho
    '#a855f7', // roxo
    '#f97316', // laranja
    '#06b6d4', // ciano
    '#ec4899', // rosa
    '#84cc16', // verde-limão
    '#f59e0b', // âmbar
];




function getHeatmapColor(ratio) {
    // Degraus abruptos — sem suavização
    if (ratio > 0.75) return '#b9ffd2';  // branco-esverdeado
    if (ratio > 0.50) return '#4ade80';  // verde vivo
    if (ratio > 0.25) return '#16a34a';  // verde médio
    if (ratio > 0.08) return '#14532d';  // verde escuro
    if (ratio > 0.01) return '#1c2b1e';  // quase preto esverdeado
    return '#0a120c';                    // preto
}

function getHeritageColor(captureRate) {
    if (captureRate > 0.70) return '#22c87a';
    if (captureRate > 0.50) return '#f0c040';
    if (captureRate > 0.20) return '#f0a500';
    return '#3a8ef0';
}

export default function MapView() {
    const [geoData, setGeoData] = useState(null);
    const geoJsonRef = useRef(null);
    const mode = useStore(state => state.mode);
    const candidateIndex = useStore(state => state.candidateIndex);
    const refCandidateIndex = useStore(state => state.refCandidateIndex);
    const selectedMunicipality = useStore(state => state.selectedMunicipality);
    const selectMunicipality = useStore(state => state.selectMunicipality);
    const closeSidebar = useStore(state => state.closeSidebar);
    const municipalData = useStore(state => state.municipalData);
    const candidates = useStore(state => state.candidates);

    const safeCandidateIndex = candidateIndex !== null
        ? Math.min(candidateIndex, Object.values(municipalData)[0]?.votes.length - 1 || 0)
        : null;

    const safeRefIndex = refCandidateIndex !== null
        ? Math.min(refCandidateIndex, Object.values(municipalData)[0]?.votes.length - 1 || 0)
        : null;

    useEffect(() => {
        fetch(GEOJSON_URL)
            .then(res => res.json())
            .then(data => setGeoData(data))
            .catch(err => console.error("Failed to load geojson", err));
    }, []);

    const maxVotesCache = useMemo(() => {
        let maxes = [];
        Object.values(municipalData).forEach(m => {
            m.votes.forEach((v, idx) => {
                maxes[idx] = Math.max(maxes[idx] || 0, v);
            });
        });
        return maxes;
    }, [municipalData]);

    // Retorna cor e intensidade para o modo compare (vencedor por município)
    const getCompareColor = (data) => {
        if (!data || candidates.length === 0) return { color: '#0a1a0f', opacity: 0.3 };

        let maxVotes = 0;
        let winnerIdx = -1;
        data.votes.forEach((v, idx) => {
            if (idx < candidates.length && v > maxVotes) {
                maxVotes = v;
                winnerIdx = idx;
            }
        });

        if (winnerIdx === -1 || maxVotes === 0) return { color: '#111827', opacity: 0.4 };

        // Margem de vitória → intensidade da cor
        let secondMax = 0;
        data.votes.forEach((v, idx) => {
            if (idx !== winnerIdx && idx < candidates.length && v > secondMax) secondMax = v;
        });
        const margin = secondMax > 0 ? (maxVotes - secondMax) / maxVotes : 1;
        const opacity = 0.45 + margin * 0.55;

        return { color: CANDIDATE_COLORS[winnerIdx % CANDIDATE_COLORS.length], opacity };
    };

    const getStyle = (feature, isHovered = false) => {
        const name = feature.properties.name;
        const isSelected = selectedMunicipality?.name === name;

        let fillColor = '#0a1a0f';
        let fillOpacity = 0.8;
        let color = '#1e3450';
        let weight = 0.5;

        const data = municipalData[name];

        if (!data || safeCandidateIndex === null) {
            fillColor = '#0a1a0f';
            fillOpacity = 0.3;
        } else if (mode === 'compare') {
            const { color: cColor, opacity } = getCompareColor(data);
            fillColor = cColor;
            fillOpacity = opacity;
        } else {
            const currentVotes = data.votes[safeCandidateIndex] ?? 0;
            const refVotes = safeRefIndex !== null ? data.votes[safeRefIndex] ?? 0 : 0;

            if (mode === 'heritage' && safeRefIndex !== null) {
                fillColor = refVotes > 0 ? getHeritageColor(currentVotes / refVotes) : '#0a1a0f';
            } else {
                const ratio = maxVotesCache[safeCandidateIndex] ? currentVotes / maxVotesCache[safeCandidateIndex] : 0;
                fillColor = getHeatmapColor(ratio);
            }
        }

        if (isHovered || isSelected) {
            color = '#f0a500';
            weight = 2.5;
            fillOpacity = 1;
        }

        return { fillColor, fillOpacity, color, weight };
    };

    useEffect(() => {
        if (geoJsonRef.current) {
            geoJsonRef.current.eachLayer(layer => {
                layer.setStyle(getStyle(layer.feature));
            });
        }
    }, [mode, candidateIndex, refCandidateIndex, selectedMunicipality, municipalData, candidates]);

    const getStyleRef = useRef(null);
    getStyleRef.current = getStyle;

    const selectedMunicipalityRef = useRef(selectedMunicipality);
    selectedMunicipalityRef.current = selectedMunicipality;

    const onEachFeature = (feature, layer) => {
        layer.on({
            mouseover: (e) => {
                e.target.setStyle(getStyleRef.current(feature, true));
                e.target.bringToFront();
            },
            mouseout: (e) => {
                e.target.setStyle(getStyleRef.current(feature, false));
                if (selectedMunicipalityRef.current?.name === feature.properties.name) {
                    e.target.bringToFront();
                }
            },
            click: (e) => {
                const title = feature.properties.name;
                if (selectedMunicipalityRef.current?.name === title) {
                    closeSidebar();
                } else {
                    selectMunicipality(title, feature.properties);
                }
            }
        });
    };

    return (
        <div className="flex-1 w-full bg-[#08101e] relative pt-14 z-0">

            {/* Legenda do modo compare */}
            {mode === 'compare' && candidates.length > 0 && (
                <div className="absolute bottom-6 left-4 z-[999] bg-bg/80 backdrop-blur-md border border-border rounded-lg px-3 py-2 flex flex-col gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted mb-0.5">Candidatos</span>
                    {candidates.map((cand, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-sm shrink-0"
                                style={{ backgroundColor: CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length] }}
                            />
                            <span className="font-mono text-[11px] text-text">{cand.name}</span>
                        </div>
                    ))}
                </div>
            )}
            <MapContainer
                center={[-12.5, -41.7]}
                zoom={7}
                zoomControl={false}
                className="h-full w-full bg-[#08101e]"
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    opacity={0.25}
                />
                {geoData && (
                    <GeoJSON
                        ref={geoJsonRef}
                        data={geoData}
                        style={(feature) => getStyle(feature, false)}
                        onEachFeature={onEachFeature}
                    />
                )}
            </MapContainer>
        </div>
    );
}
// export default function MapView() {
//     const [geoData, setGeoData] = useState(null);
//     const geoJsonRef = useRef(null);
//     const mode = useStore(state => state.mode);
//     const candidateIndex = useStore(state => state.candidateIndex);
//     const refCandidateIndex = useStore(state => state.refCandidateIndex);
//     const selectedMunicipality = useStore(state => state.selectedMunicipality);
//     const selectMunicipality = useStore(state => state.selectMunicipality);
//     const closeSidebar = useStore(state => state.closeSidebar);
//     const municipalData = useStore(state => state.municipalData);
//     const safeCandidateIndex = candidateIndex !== null
//         ? Math.min(candidateIndex, Object.values(municipalData)[0]?.votes.length - 1 || 0)
//         : null;

//     const safeRefIndex = refCandidateIndex !== null
//         ? Math.min(refCandidateIndex, Object.values(municipalData)[0]?.votes.length - 1 || 0)
//         : null;

//     useEffect(() => {
//         fetch(GEOJSON_URL)
//             .then(res => res.json())
//             .then(data => setGeoData(data))
//             .catch(err => console.error("Failed to load geojson", err));
//     }, []);
//     // Pre-calculate max votes for heatmap scaling
//     const maxVotesCache = useMemo(() => {
//         let maxes = [];
//         Object.values(municipalData).forEach(m => {
//             m.votes.forEach((v, idx) => {
//                 maxes[idx] = Math.max(maxes[idx] || 0, v);
//             });
//         });
//         return maxes;
//     }, [municipalData]);

//     // Function to determine style for a feature
//     const getStyle = (feature, isHovered = false) => {
//         const name = feature.properties.name;
//         const isSelected = selectedMunicipality?.name === name;

//         let fillColor = '#0d1e30';
//         let fillOpacity = 0.8;
//         let color = '#1e3450';
//         let weight = 0.5;

//         const data = municipalData[name];

//         if (!data || safeCandidateIndex === null) {
//             fillColor = '#0d1e30';
//             fillOpacity = 0.3;
//         } else {
//             const currentVotes = data.votes[safeCandidateIndex] ?? 0;
//             const refVotes = safeRefIndex !== null ? data.votes[safeRefIndex] ?? 0 : 0;

//             if (mode === 'heritage' && safeRefIndex !== null) {
//                 fillColor = refVotes > 0 ? getHeritageColor(currentVotes / refVotes) : '#0d1e30';
//             } else {
//                 const ratio = maxVotesCache[safeCandidateIndex] ? currentVotes / maxVotesCache[safeCandidateIndex] : 0;
//                 fillColor = getHeatmapColor(ratio);
//             }
//         }

//         if (isHovered || isSelected) {
//             color = '#f0a500';
//             weight = 2.5;
//             fillOpacity = 1;
//         }

//         return { fillColor, fillOpacity, color, weight };
//     };

//     // Restyle all layer when context changes securely via Leaflet ref
//     useEffect(() => {
//         if (geoJsonRef.current) {
//             geoJsonRef.current.eachLayer(layer => {
//                 layer.setStyle(getStyle(layer.feature));
//             });
//         }
//     }, [mode, candidateIndex, refCandidateIndex, selectedMunicipality, municipalData]);
 
//     const getStyleRef = useRef(null);
//     getStyleRef.current = getStyle;

//     const selectedMunicipalityRef = useRef(selectedMunicipality); // ✅ adicionar
//     selectedMunicipalityRef.current = selectedMunicipality;        // ✅ atualiza a cada render

//     const onEachFeature = (feature, layer) => {
//         layer.on({
//             mouseover: (e) => {
//                 e.target.setStyle(getStyleRef.current(feature, true));
//                 e.target.bringToFront();
//             },
//             mouseout: (e) => {
//                 e.target.setStyle(getStyleRef.current(feature, false));
//                 if (selectedMunicipalityRef.current?.name === feature.properties.name) { // ✅
//                     e.target.bringToFront();
//                 }
//             },
//             click: (e) => {
//                 const title = feature.properties.name;
//                 if (selectedMunicipalityRef.current?.name === title) { // ✅
//                     closeSidebar();
//                 } else {
//                     selectMunicipality(title, feature.properties);
//                 }
//             }
//         });
//     };
//     return (
//         <div className="flex-1 w-full bg-[#08101e] relative pt-14 z-0">
//             <MapContainer
//                 center={[-12.5, -41.7]}
//                 zoom={7}
//                 zoomControl={false}
//                 className="h-full w-full bg-[#08101e]"
//             >
//                 <TileLayer
//                     url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
//                     attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
//                     opacity={0.25}
//                 />
//                 {geoData && (
//                     <GeoJSON
//                         ref={geoJsonRef}
//                         data={geoData}
//                         style={(feature) => getStyle(feature, false)}
//                         onEachFeature={onEachFeature}
//                     />
//                 )}
//             </MapContainer>
//         </div>
//     );
// }
