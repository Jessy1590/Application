# Préférences utilisateur

Table `"PharmaOs".user_preferences` — thème, placement / densité taskbar, tailles de police.

- Migrations : `045_user_preferences.sql`, `046_prefs_themes_density_fonts.sql`, `047_prefs_themes_bleu_dore.sql`
- Thèmes : `clair` | `sombre` | `colore` | `bleu_dore` (legacy `contraste`→`clair`, `daltonien`→`bleu_dore`)
- Densités : `compact` | `normal` | `detaillee` | `empilee` (legacy `auto`→`normal`, `stack`→`empilee`)
- Polices : `font_size_taskbar` / `font_size_dashboard` — `sm` | `md` | `lg`
- RLS : SELECT / INSERT / UPDATE / DELETE own (`user_id = auth.uid()`)
- Service : `src/modules/prefs/services/prefsService.js`
