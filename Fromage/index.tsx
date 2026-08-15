import React, { useState, useEffect, useRef } from "react";
import { Plus, X, Pencil, Check, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// ---------- Configuration Supabase ----------
const SUPABASE_URL = 'https://kpjflntnotftpzffjbud.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';

// On indique explicitement à Supabase d'utiliser le schéma "Fromage"
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { 
  db: { schema: 'Fromage' } 
});

// ---------- Config & Seed ----------
const MAIN_CATS = {
  vache: { label: "Fromage de vache", emoji: "🐮", accent: "#B4791A", tint: "#FBF3E3" },
  chevre: { label: "Fromages de Chèvre", emoji: "🐐", accent: "#5F7A3D", tint: "#F1F5E9" },
  brebis: { label: "Fromages de Brebis", emoji: "🐑", accent: "#9C4A3C", tint: "#FBEBE7" },
};

const SUBCATS = [
  "Pâtes Persillées (Les Bleus)",
  "Pâtes Molles à Croûte Fleurie",
  "Pâtes Molles à Croûte Lavée",
  "Pâtes Molles à Croûte Naturelle",
  "Pâtes Pressées Non Cuites",
  "Pâtes Pressées Cuites",
  "Fromages Frais & Spécialités",
  "Pâtes Filées",
];

// Seed (transcrit depuis ta liste)
const RAW_SEED = [
  ["Gorgonzola", "vache", SUBCATS[0], [10]],
  ["Bleu de Gex AOP", "vache", SUBCATS[0], [10]],
  ["Pavé d'Affinois Brin", "vache", SUBCATS[1], [10]],
  ["Saint Albray", "vache", SUBCATS[2], [10]],
  ["Tomme suisse poivre et citron", "vache", SUBCATS[4], [10]],
  ["Emmental français", "vache", SUBCATS[5], [8]],
  ["Stracciatella", "vache", SUBCATS[6], [3]],
  ["Mozzarella", "vache", SUBCATS[7], [1]],
  ["Bûche de chèvre", "chevre", null, [10]],
  ["Ardi Gasna (Brebis des Pyrénées)", "brebis", null, [9]]
];

function buildSeed() {
  return RAW_SEED.map(([name, main, sub, notes], i) => ({
    id: `seed-${i}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    main,
    sub,
    notes: notes.map((v, j) => ({ id: `seed-${i}-${j}`, value: v })),
  }));
}

function avg(notes) {
  if (!notes || notes.length === 0) return null;
  return notes.reduce((a, n) => a + n.value, 0) / notes.length;
}

function fmt(n) {
  if (n === null) return "—";
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, "");
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Fonction API Claude (Inchangée)
async function callClaude(systemPrompt, userPrompt) { /* ... Ton code original ... */ }
async function classifyCheese(name) { /* ... Ton code original ... */ }
async function suggestCheeses(cheeses) { /* ... Ton code original ... */ }

// ---------- Component ----------
export default function FromageTracker() {
  const [cheeses, setCheeses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [noteDraftFor, setNoteDraftFor] = useState(null);
  const [noteDraftValue, setNoteDraftValue] = useState("");
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const editInputRef = useRef(null);

  // Chargement depuis Supabase au démarrage (Table 'notes' dans le schéma 'Fromage')
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('notes').select('*');
        
        if (error) throw error;

        if (data && data.length > 0) {
          setCheeses(data);
        } else {
          // Si la DB est vide, on la remplit avec le Seed
          const seed = buildSeed();
          const { error: insertError } = await supabase.from('notes').insert(seed);
          if (insertError) throw insertError;
          setCheeses(seed);
        }
      } catch (e) {
        console.error(e);
        setError("Erreur de connexion à la base de données.");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function toggleCollapse(key) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  // ---- Add cheese flow ----
  function startAdd() {
    setModal({ step: "name", name: "", note: "", main: null, sub: null });
  }
  function cancelModal() {
    setModal(null);
  }
  function submitName(e) {
    e.preventDefault();
    if (!modal.name.trim()) return;
    setModal({ ...modal, step: "note" });
  }
  async function submitNote(e) {
    e.preventDefault();
    setModal((m) => ({ ...m, step: "classifying" }));
    try {
      const { main, sub } = await classifyCheese(modal.name.trim());
      setModal((m) => ({ ...m, main, sub, step: "confirm" }));
    } catch (err) {
      setModal((m) => ({ ...m, step: "main", aiFailed: true }));
    }
  }
  function chooseMain(main) {
    if (main === "vache") {
      setModal({ ...modal, main, step: "sub" });
    } else {
      finalizeAdd(main, null);
    }
  }
  function chooseSub(sub) {
    finalizeAdd(modal.main, sub);
  }

  async function finalizeAdd(main, sub) {
    const noteVal = parseFloat((modal.note || "").replace(",", "."));
    const notesArr = !isNaN(noteVal) ? [{ id: uid(), value: noteVal }] : [];
    const newCheese = { id: uid(), name: modal.name.trim(), main, sub, notes: notesArr };
    
    // Optimistic UI update
    setCheeses((prev) => [...prev, newCheese]);
    setModal(null);

    // Supabase Insert dans Fromage.notes
    const { error } = await supabase.from('notes').insert([newCheese]);
    if (error) setError("Échec de la sauvegarde du fromage.");
  }

  // ---- Suggestions ----
  async function loadSuggestions() { /* ... Inchangé ... */ }
  
  async function addSuggestion(s) {
    const newCheese = {
      id: uid(),
      name: s.nom,
      main: s.main,
      sub: s.main === "vache" ? s.sub : null,
      notes: [],
    };
    
    setCheeses((prev) => [...prev, newCheese]);
    setSuggestions((prev) => prev.filter((x) => x.nom !== s.nom));

    const { error } = await supabase.from('notes').insert([newCheese]);
    if (error) setError("Erreur lors de l'ajout de la suggestion.");
  }

  // ---- Edit name ----
  function startEditName(c) {
    setEditingId(c.id);
    setEditingName(c.name);
    setTimeout(() => editInputRef.current && editInputRef.current.focus(), 0);
  }
  
  async function saveEditName(id) {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    const newName = editingName.trim();
    
    setCheeses((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    setEditingId(null);

    const { error } = await supabase.from('notes').update({ name: newName }).eq('id', id);
    if (error) setError("Erreur lors de la modification du nom.");
  }

  // ---- Notes ----
  function startAddNote(id) {
    setNoteDraftFor(id);
    setNoteDraftValue("");
  }
  
  async function saveAddNote(id) {
    const v = parseFloat((noteDraftValue || "").replace(",", "."));
    if (isNaN(v)) {
      setNoteDraftFor(null);
      return;
    }
    
    const cheeseToUpdate = cheeses.find((c) => c.id === id);
    const updatedNotes = [...cheeseToUpdate.notes, { id: uid(), value: v }];

    setCheeses((prev) => prev.map((c) => c.id === id ? { ...c, notes: updatedNotes } : c));
    setNoteDraftFor(null);

    const { error } = await supabase.from('notes').update({ notes: updatedNotes }).eq('id', id);
    if (error) setError("Erreur lors de l'ajout de la note.");
  }

  async function removeNote(cheeseId, noteId) {
    const cheeseToUpdate = cheeses.find((c) => c.id === cheeseId);
    const updatedNotes = cheeseToUpdate.notes.filter((n) => n.id !== noteId);

    setCheeses((prev) => prev.map((c) => c.id === cheeseId ? { ...c, notes: updatedNotes } : c));

    const { error } = await supabase.from('notes').update({ notes: updatedNotes }).eq('id', cheeseId);
    if (error) setError("Erreur lors de la suppression de la note.");
  }

  async function deleteCheese(id) {
    setCheeses((prev) => prev.filter((c) => c.id !== id));

    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) setError("Erreur lors de la suppression du fromage.");
  }

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#7a6a55", fontFamily: "Inter, sans-serif" }}>
        Chargement du carnet...
      </div>
    );
  }

  // Reste du composant (Render / JSX) identique
  return (
      <div style={{ background: "#FAF6EC", minHeight: "100vh", fontFamily: "Inter, sans-serif", color: "#2B2118" }}>
      {/* ... TON JSX ACTUEL ... */}
      </div>
  )
}