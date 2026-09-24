# 📍 État actuel du projet (STATE)

## Fonctionnalités actives et terminées
- **Core Engine (M&A) :** Les calculs d'EBE retraité, valorisation (Marge, CA, EBE), barème IS, TNS, et ratios nationaux sont fully implémentés[cite: 2].
- **Prévisionnel Financier :** Le Tableau de Flux de Trésorerie (TFT) sur 7 ans est fonctionnel, intégrant les amortissements, le BFR, les dividendes et le point mort[cite: 2].
- **Ajustements intelligents :** Interfaces modales permettant d'ajuster finement la masse salariale, les charges externes et la croissance prévisionnelle (`previ_state`)[cite: 2].
- **Montage Juridique :** Gestion des cas "Fonds de commerce" vs "Titres (Parts sociales)" avec déduction automatique de la dette nette[cite: 2].
- **Financement :** Prêts bancaires classiques, crédit vendeur (in fine ou capital), prêts d'honneur, boosters d'apport, et montants SCI immobilière[cite: 2].
- **Export PDF :** Rapport généré dynamiquement avec graphiques (Chart.js) et conclusion automatisée sur les forces/faiblesses du projet[cite: 2].
- **Automatisation IA :** Module d'import de bilan (OCR IA vers JSON) fonctionnel avec système d'apprentissage des mappings (`import_mappings`)[cite: 1, 2].

## Prochaines étapes de développement (TODO)
*(Ajoutez ici vos futures demandes, par exemple :)*
- [ ] Vérifier que toutes les formules utilisés soit cohérente
- [ ] Créer un systeme de partage de pharma
- [ ] Sécurisé les fichiers et les données sensibles (dont les infos de connexion de la base de données)
- [ ] Eclater le code et créer une architecture modulaire pour améliorer les futurs modifications
