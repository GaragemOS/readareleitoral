import { useStore, prevVotes } from '../store';



function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const INSIGHTS = {
    heritage: {
        null_base: [
            "Candidato referência sem votos aqui. Território virgem — construir base do zero.",
            "Sem herança disponível. Foco em captação orgânica e presença local.",
            "Base de referência inexistente neste município. Avaliar custo-benefício de investimento.",
        ],
        low: [
            "Alta herança disponível. Eleitores do referência ainda não migrados — prioridade máxima.",
            "Potencial inexplorado. Eleitores ideologicamente alinhados aguardam mobilização.",
            "Janela de oportunidade aberta. Trabalho de campo aqui tem retorno acima da média.",
            "Transferência de votos incipiente. Candidato referência deixou terreno fértil.",
        ],
        mid: [
            "Herança em andamento. Intensificar contato direto para consolidar migração.",
            "Base parcialmente capturada. Há margem real de crescimento com mobilização focada.",
            "Conversão moderada. Eleitores indecisos do referência são alvo prioritário.",
            "Território em disputa. Presença constante pode inclinar a balança.",
        ],
        high: [
            "Herança bem absorvida. Manter coesão com o eleitorado do referência.",
            "Base consolidada. Risco de canibalização — monitorar movimentos concorrentes.",
            "Alta taxa de conversão. Priorizar retenção e evitar abstenção.",
            "Eleitorado fiel. Foco em turnout — cada voto aqui já está quase garantido.",
        ],
    },
    geral: {
        first: [
            "Território dominante. Estratégia: blindar a base e garantir comparecimento.",
            "Liderança sólida. Evitar comodismo.",
            "Reduto eleitoral confirmado. Maximizar presença para ampliar margem.",
            "Posição de força. Explorar como vitrine para municípios vizinhos.",
        ],
        growing: [
            "Crescimento real detectado. Momento de dobrar o investimento aqui.",
            "Tendência positiva. Avaliar o que funciona e replicar em municípios similares.",
            "Zona de avanço. Eleitorado respondendo — manter ritmo e não recuar.",
            "Expansão em curso. Identifique o fator local e potencialize.",
        ],
        losing: [
            "Queda de votos. Investigar perda antes do próximo ciclo.",
            "Território em erosão. Reconquistar exige diagnóstico preciso e ação imediata.",
            "Retrocesso eleitoral. Avaliar se há candidato local drenando votos.",
            "Sinal de alerta. Ausência de campanha local pode estar custando caro.",
        ],
    },
    penetracao: {
        alta: [
            "Alta penetração na população. Candidato tem presença real no cotidiano local.",
            "Índice expressivo per capita. Território com enraizamento sólido.",
            "Representa fatia significativa da população. Referência local consolidada.",
        ],
        media: [
            "Penetração razoável. Há espaço para crescimento com trabalho de base.",
            "Presença moderada na população. Potencial ainda não totalmente explorado.",
            "Índice dentro da média. Diferencial pode estar na mobilização do eleitorado fiel.",
        ],
        baixa: [
            "Baixa penetração na população local. Município pouco trabalhado eleitoralmente.",
            "Poucos votos em relação ao tamanho do município. Investigar barreiras locais.",
            "Território subexplorado. Custo de aquisição de voto aqui pode ser alto.",
        ],
    },
};

export default function InsightCard({ municipalityName, mode, candidateIndex, refCandidateIndex }) {
    const municipalData = useStore(state => state.municipalData);
    const candidates = useStore(state => state.candidates);
    const data = municipalData[municipalityName];
    if (!data) return null;

    const rankings = candidates.map((_, idx) => ({
        index: idx,
        votes: data.votes[idx] || 0,
    })).sort((a, b) => b.votes - a.votes);

    const currentRank = rankings.findIndex(r => r.index === candidateIndex) + 1;
    const currentVotes = data.votes[candidateIndex] || 0;
    const previousVotes = prevVotes(municipalityName, candidateIndex, municipalData);
    const delta = currentVotes - previousVotes;

    const populacao = data.pop || null;
    const penetracao = populacao ? currentVotes / populacao : null;

    let highlightText = "";

    if (mode === 'heritage' && refCandidateIndex !== null) {
        const refVotes = data.votes[refCandidateIndex];
        if (!refVotes) {
            highlightText = pickRandom(INSIGHTS.heritage.null_base);
        } else {
            const captureRate = currentVotes / refVotes;
            if (captureRate < 0.20) highlightText = pickRandom(INSIGHTS.heritage.low);
            else if (captureRate <= 0.60) highlightText = pickRandom(INSIGHTS.heritage.mid);
            else highlightText = pickRandom(INSIGHTS.heritage.high);
        }
    } else {
        if (currentRank === 1) highlightText = pickRandom(INSIGHTS.geral.first);
        else if (delta > 0) highlightText = pickRandom(INSIGHTS.geral.growing);
        else highlightText = pickRandom(INSIGHTS.geral.losing);
    }

    let penetracaoText = "";
    if (penetracao !== null) {
        if (penetracao > 0.15) penetracaoText = pickRandom(INSIGHTS.penetracao.alta);
        else if (penetracao > 0.05) penetracaoText = pickRandom(INSIGHTS.penetracao.media);
        else penetracaoText = pickRandom(INSIGHTS.penetracao.baixa);
    }

    return (
        <div className="mt-4 flex flex-col gap-2">
            <div className="border-l-2 border-accent bg-accent/10 p-4 rounded-r">
                <p className="font-body text-sm text-text leading-relaxed">{highlightText}</p>
            </div>

            {penetracaoText && (
                <div className="border-l-2 border-muted bg-surface p-4 rounded-r flex items-center justify-between gap-4">
                    <p className="font-body text-sm text-text leading-relaxed">{penetracaoText}</p>
                    <span className="font-mono text-xs text-muted shrink-0">
                        {(penetracao * 100).toFixed(1)}% da pop.
                    </span>
                </div>
            )}
        </div>
    );
}