import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { searchCandidates } from '../elections';
import { Search, X, Star, BookOpen, Wifi } from 'lucide-react';
import './Header.css';

const ANOS = [2022, 2018];

export default function Header() {
    const favorites = useStore(s => s.favorites);
    const activeFavoriteIndex = useStore(s => s.activeFavoriteIndex);
    const isLoading = useStore(s => s.isLoading);
    const ano = useStore(s => s.ano);
    const setAno = useStore(s => s.setAno);
    const setActiveFavorite = useStore(s => s.setActiveFavorite);
    const loadCandidateByNumber = useStore(s => s.loadCandidateByNumber);
    const removeFavorite = useStore(s => s.removeFavorite);

    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchOpen, setSearchOpen] = useState(false);

    // ── Search debounce ────────────────────────────────
    useEffect(() => {
        if (searchText.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            const result = await searchCandidates(searchText, ano);
            setSearchResults(result || []);
            setSearchOpen(true);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchText, ano]);

    const handleSelectCandidate = useCallback(async (c) => {
        setSearchText('');
        setSearchResults([]);
        setSearchOpen(false);
        try {
            await loadCandidateByNumber(c.numero, c.cargo);
        } catch (e) {
            console.error(e);
        }
    }, [loadCandidateByNumber]);

    return (
        <header className="header">
            {/* Left side: branding */}
            <div className="header-left">
                <div className="header-brand">
                    <Wifi size={24} className="header-logo-icon" />
                    <div>
                        <h1 className="header-title">Radar Eleitoral</h1>
                        <span className="header-subtitle">Inteligência Eleitoral</span>
                    </div>
                </div>
            </div>

            {/* Center: search */}
            <div className="header-center">
                <div className="header-search-wrapper">
                    <Search size={16} className="header-search-icon" />
                    <input
                        type="text"
                        className="header-search-input"
                        placeholder="Buscar candidato por nome..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                    />
                    {searchText && (
                        <button className="header-search-clear" onClick={() => { setSearchText(''); setSearchResults([]); setSearchOpen(false); }}>
                            <X size={14} />
                        </button>
                    )}
                    {isLoading && <div className="header-search-spinner" />}

                    {/* Dropdown */}
                    {searchOpen && searchResults.length > 0 && (
                        <div className="header-search-dropdown">
                            {searchResults.map((c, i) => (
                                <button
                                    key={`${c.numero}-${c.cargo}-${i}`}
                                    className="header-search-result"
                                    onClick={() => handleSelectCandidate(c)}
                                >
                                    <div className="header-search-result-info">
                                        <span className="header-search-result-name">{c.nome}</span>
                                        <span className="header-search-result-meta">{c.cargo} · {c.partido} · Nº {c.numero}</span>
                                    </div>
                                    <span className="header-search-result-votes">{c.total_votos?.toLocaleString('pt-BR')} votos</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right side: Herança + year tabs + favorites */}
            <div className="header-right">
                {/* Herança Eleitoral (placeholder) */}
                <button
                    className="header-heranca-btn"
                    title="Herança Eleitoral — Em breve"
                    onClick={() => { }}
                >
                    <BookOpen size={14} />
                    <span>Herança</span>
                </button>

                {/* Year tabs */}
                <div className="header-year-tabs">
                    {ANOS.map(a => (
                        <button
                            key={a}
                            className={`header-year-tab ${ano === a ? 'active' : ''}`}
                            onClick={() => setAno(a)}
                            disabled={isLoading}
                        >
                            {a}
                        </button>
                    ))}
                </div>

                {/* Favorites */}
                {favorites.length > 0 && (
                    <div className="header-favorites">
                        {favorites.map((fav, idx) => (
                            <div
                                key={`${fav.numero}-${idx}`}
                                className={`header-fav-chip ${idx === activeFavoriteIndex ? 'active' : ''}`}
                                onClick={() => setActiveFavorite(idx)}
                            >
                                <Star size={12} />
                                <span className="header-fav-name">{fav.name}</span>
                                <button
                                    className="header-fav-close"
                                    onClick={(e) => { e.stopPropagation(); removeFavorite(idx); }}
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </header>
    );
}