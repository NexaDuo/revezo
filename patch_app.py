import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Add imports
imports = """import { fetchEquipe } from './lib/fetchData';
import { generateSchedule, defaultConfig, Escala, Violacao } from './lib/solver';
import { ScheduleGrid } from './components/ScheduleGrid';

export const App"""
content = content.replace("export const App", imports)

# Add states
states = """  const [activeTab, setActiveTab] = useState<'grade' | 'equipe' | 'regras' | 'historico'>('grade');

  const [escala, setEscala] = useState<Escala | null>(null);
  const [violacoes, setViolacoes] = useState<Violacao[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGerarGrade = async () => {
    setIsGenerating(true);
    try {
      const { equipe, disp } = await fetchEquipe(isSupabaseConfigured);
      const config = { ...defaultConfig, equipe, disp };
      const result = generateSchedule(config);
      setEscala(result.escala);
      setViolacoes(result.violacoes);
      setScore(result.score);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };"""
content = content.replace("  const [activeTab, setActiveTab] = useState<'grade' | 'equipe' | 'regras' | 'historico'>('grade');", states)

# Update score display
score_disp_orig = """              <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                0 rígidas · 1 alerta
              </span>"""
score_disp_new = """              {score !== null ? (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${score === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {violacoes.filter(v => v.hard).length} rígidas · {violacoes.filter(v => !v.hard).length} alerta{violacoes.filter(v => !v.hard).length !== 1 ? 's' : ''} (Score: {Math.round(score)})
                </span>
              ) : (
                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                  Pronto para gerar
                </span>
              )}"""
content = content.replace(score_disp_orig, score_disp_new)

# Update button
button_orig = """                <button 
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>Gerar com Solver (350 reinícios)</span>
                </button>"""
button_new = """                <button 
                  onClick={handleGerarGrade}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>{isGenerating ? 'Gerando...' : 'Gerar Grade'}</span>
                </button>"""
content = content.replace(button_orig, button_new)

# Update grid
grid_orig = """            {/* Aviso de integração do solver */}
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center font-bold">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Módulo de Grade Semanal Pronto para Port</h3>
              <p className="text-xs text-slate-600 max-w-lg mx-auto">
                O solver determinístico (350 reinícios), o validador de regras e o gerador de DOCX OOXML estão documentados em <code className="bg-slate-200 px-1 py-0.5 rounded">docs/referencia/editor_escala.html</code> e serão conectados aos componentes React tipados.
              </p>
            </div>"""
grid_new = """            {/* Aviso de integração do solver ou Grade renderizada */}
            {!escala ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center font-bold">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Módulo de Grade Semanal Pronto para Port</h3>
                <p className="text-xs text-slate-600 max-w-lg mx-auto">
                  Clique em "Gerar Grade" para visualizar a escala gerada pelo solver.
                </p>
              </div>
            ) : (
              <ScheduleGrid escala={escala} violacoes={violacoes} dias={defaultConfig.dias} />
            )}"""
content = content.replace(grid_orig, grid_new)

with open("src/App.tsx", "w") as f:
    f.write(content)

