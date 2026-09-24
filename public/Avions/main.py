import tkinter as tk
from tkinter import ttk, messagebox
import json
from PIL import Image, ImageTk
import requests
from io import BytesIO
import random
import logging
import os
from datetime import datetime

# Configuration du logging
def setup_logging():
    # Création du dossier logs s'il n'existe pas
    if not os.path.exists('logs'):
        os.makedirs('logs')
        
    # Trouver le prochain numéro de fichier disponible
    existing_logs = [f for f in os.listdir('logs') if f.startswith('game_') and f.endswith('.log')]
    if not existing_logs:
        next_number = 1
    else:
        # Extraire les numéros des fichiers existants
        numbers = [int(f.split('_')[1].split('.')[0]) for f in existing_logs]
        next_number = max(numbers) + 1
        
    # Créer le nom du fichier
    log_file = f'logs/game_{next_number}.log'
    
    # Configuration du logging
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8', mode='w'),
            logging.StreamHandler()  # Affiche aussi dans la console
        ]
    )
    
    logging.info(f'=== Démarrage de la partie {next_number} ===')
    logging.info(f'Fichier de log: {log_file}')

# Initialisation du logging
setup_logging()

# Chargement et réinitialisation des données JSON
try:
    with open('config.json', 'r') as file:
        config_data = json.load(file)
    # Réinitialisation de In_game au démarrage
    config_data["In_game"] = {
        "nombre_joueurs": 0,
        "joueurs": {}
    }
    with open('config.json', 'w') as file:
        json.dump(config_data, file, indent=4, ensure_ascii=False)
    logging.info('Configuration JSON chargée et réinitialisée avec succès')
except Exception as e:
    logging.error(f'Erreur lors du chargement/réinitialisation du fichier config.json: {str(e)}')
    raise

class MainApplication:
    def __init__(self, root):
        logging.info('Initialisation de l\'application principale')
        self.root = root
        self.root.title("Jeu d'Avions")
        self.root.geometry("800x600")
        
        # Configuration du style
        self.style = ttk.Style()
        self.style.configure('TButton', padding=10, font=('Helvetica', 12))
        
        # Nettoyer la fenêtre principale
        for widget in self.root.winfo_children():
            widget.destroy()

        logging.debug('Interface principale créée')            
        # Frame principal
        self.main_frame = ttk.Frame(self.root, padding="20")
        self.main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Titre
        title_label = ttk.Label(self.main_frame, text="Menu Principal", font=('Helvetica', 24))
        title_label.grid(row=0, column=0, pady=20)
        
        # Boutons
        buttons = [
            ("Nouvelle Partie", self.start_new_game),
            ("Continuer Partie", self.continue_game),
            ("Campagne Test", self.start_test_campaign)
        ]
        
        for idx, (text, command) in enumerate(buttons, start=1):
            btn = ttk.Button(self.main_frame, text=text, command=command)
            btn.grid(row=idx, column=0, pady=10, padx=20, sticky="ew")
            
        logging.debug('Menu principal créé avec succès')

    def start_test_campaign(self):
        """Lance une partie test avec un joueur Japon (A6M5) et un joueur US (F4U)"""
        try:
            # Préparer les données de la partie test
            game_data = {
                "nombre_joueurs": 2,
                "joueurs": {
                    "1": {
                        "pays": "Japon",
                        "avions": {
                            "1": {
                                "nom": "A6M5",
                                "PV_actuel": config_data["avion_chasseur"]["A6M5"]["PV"],
                                "role": "Leader",
                                "de_initial": 8,  # Valeur fixe pour le test
                                "pilot_skill": 16,  # 8 (dé) + 6 + 2 (leader)
                                "energie": 1,
                                "initiative": 0,
                                "equipe": "Japon",
                                "armes": config_data["avion_chasseur"]["A6M5"]["Armes"],
                                "critiques_subis": [],
                                "statut": "actif",
                                "menace": ""
                            }
                        }
                    },
                    "2": {
                        "pays": "US",
                        "avions": {
                            "1": {
                                "nom": "F4U",
                                "PV_actuel": config_data["avion_chasseur"]["F4U"]["PV"],
                                "role": "Leader",
                                "de_initial": 8,  # Valeur fixe pour le test
                                "pilot_skill": 16,  # 8 (dé) + 6 + 2 (leader)
                                "energie": 1,
                                "initiative": 0,
                                "equipe": "US",
                                "armes": config_data["avion_chasseur"]["F4U"]["Armes"],
                                "critiques_subis": [],
                                "statut": "actif",
                                "menace": ""
                            }
                        }
                    }
                },
                "current_phase": "initiative",  # Ajout de la phase courante
                "current_round": 1  # Ajout du round courant
            }

            # Sauvegarder les données dans config.json
            config_data["In_game"] = game_data
            with open('config.json', 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)

            logging.info('Configuration de la campagne test sauvegardée')

            # Ne pas cacher la fenêtre principale
            # self.root.withdraw()  # Cette ligne est supprimée

            # Lancer le gestionnaire de phases
            game_phase_manager = self.GamePhaseManager(self)
            game_phase_manager.round_number = 1
            game_phase_manager.start_game()

        except Exception as e:
            logging.error(f'Erreur lors du lancement de la campagne test: {str(e)}')
            messagebox.showerror("Erreur", "Impossible de lancer la campagne test")

    class NewGameManager:
        def __init__(self, parent):
            self.parent = parent
            self.window = None
            self.player_frame = None
            self.current_player = 1
            self.nombre_joueurs = 2
            self.player_data = {}
            self.avions_selectionnes = {}
            self.avions_frame = None
            self.selected_planes_frame = None
            self.pays_selectionne = None

        def start(self):
            """Démarre le processus de nouvelle partie"""
            logging.info('Ouverture de la fenêtre de choix des joueurs')
            self.window = tk.Toplevel(self.parent.root)
            self.window.title("Choix des joueurs")
            self.window.geometry("800x600")
            
            self.player_frame = ttk.Frame(self.window, padding="20")
            self.player_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
            
            self._show_player_count_selection()

        def _show_player_count_selection(self):
            """Affiche l'interface de sélection du nombre de joueurs"""
            # Nettoyage du frame
            for widget in self.player_frame.winfo_children():
                widget.destroy()
            
            # Titre
            title_label = ttk.Label(self.player_frame, text="Sélection du nombre de joueurs", font=('Helvetica', 20))
            title_label.grid(row=0, column=0, columnspan=2, pady=20)
            
            # Spinbox pour le nombre de joueurs
            ttk.Label(self.player_frame, text="Nombre de joueurs:").grid(row=1, column=0, pady=10)
            self.player_count = ttk.Spinbox(self.player_frame, from_=2, to=10, width=5)
            self.player_count.grid(row=1, column=1, pady=10)
            self.player_count.set(2)
            
            # Bouton pour continuer
            ttk.Button(self.player_frame, text="Commencer", 
                      command=self._initialize_player_selection).grid(row=2, column=0, columnspan=2, pady=20)

        def _initialize_player_selection(self):
            """Initialise la sélection des joueurs"""
            try:
                self.nombre_joueurs = int(self.player_count.get())
                self.avions_selectionnes[1] = []
                self._show_player_selection()
            except ValueError:
                messagebox.showerror("Erreur", "Veuillez entrer un nombre valide de joueurs")
                return

        def _show_player_selection(self):
            """Affiche l'interface de sélection des avions pour le joueur actuel"""
            # Nettoyage du frame
            for widget in self.player_frame.winfo_children():
                widget.destroy()
            
            # Titre
            title_label = ttk.Label(self.player_frame, 
                                  text=f"Joueur {self.current_player}", 
                                  font=('Helvetica', 20))
            title_label.grid(row=0, column=0, columnspan=3, pady=20)
            
            self._setup_country_selection()
            self._setup_plane_selection()
            self._setup_navigation()

        def _setup_country_selection(self):
            """Configure la sélection du pays"""
            pays_frame = ttk.LabelFrame(self.player_frame, text="Sélection du pays", padding="10")
            pays_frame.grid(row=1, column=0, columnspan=3, pady=10, sticky=(tk.W, tk.E))
            
            pays_disponibles = set(avion['Equipe'] for avion in config_data['avion_chasseur'].values())
            self.pays_selectionne = tk.StringVar()
            
            for i, pays in enumerate(sorted(pays_disponibles)):
                ttk.Radiobutton(pays_frame, text=pays, variable=self.pays_selectionne, 
                              value=pays, command=self._update_avions_disponibles).grid(row=i//3, column=i%3, padx=10, pady=5)

        def _setup_plane_selection(self):
            """Configure les frames de sélection d'avions"""
            self.avions_frame = ttk.LabelFrame(self.player_frame, text="Sélection des avions", padding="10")
            self.avions_frame.grid(row=2, column=0, columnspan=3, pady=10, sticky=(tk.W, tk.E))
            
            self.selected_planes_frame = ttk.LabelFrame(self.player_frame, text="Avions sélectionnés", padding="10")
            self.selected_planes_frame.grid(row=3, column=0, columnspan=3, pady=10, sticky=(tk.W, tk.E))

        def _setup_navigation(self):
            """Configure les boutons de navigation"""
            nav_frame = ttk.Frame(self.player_frame)
            nav_frame.grid(row=4, column=0, columnspan=3, pady=20)
            
            ttk.Button(nav_frame, text="Valider", 
                          command=self._next_player).grid(row=0, column=1, padx=10)

        def _update_avions_disponibles(self):
            """Met à jour la liste des avions disponibles selon le pays sélectionné"""
            for widget in self.avions_frame.winfo_children():
                widget.destroy()
            
            pays = self.pays_selectionne.get()
            if not pays:
                return
            
            # Réinitialisation si changement de pays
            if self.avions_selectionnes[self.current_player]:
                ancien_pays = config_data['avion_chasseur'][self.avions_selectionnes[self.current_player][0]['nom']]['Equipe']
                if ancien_pays != pays:
                    self.avions_selectionnes[self.current_player] = []
                    self._update_selected_planes_display()
            
            # Liste et affichage des avions du pays
            avions_pays = [(nom, specs) for nom, specs in config_data['avion_chasseur'].items() 
                          if specs['Equipe'] == pays]
            
            for i, (nom, _) in enumerate(avions_pays):
                ttk.Button(self.avions_frame, text=nom,
                          command=lambda n=nom: self._ajouter_avion(n)).grid(row=i//3, column=i%3, padx=5, pady=5)

        def _ajouter_avion(self, nom_avion):
            """Ajoute un avion à la sélection du joueur actuel"""
            if not self.avions_selectionnes[self.current_player]:
                role = "Leader"
                numero = 1
            else:
                role = "Normal"
                numero = len(self.avions_selectionnes[self.current_player]) + 1
                
            de = random.randint(2, 12)
            base_skill = de + 6
            if role == "Leader":
                base_skill += 2
            pilot_skill = min(18, base_skill)
            
            self.avions_selectionnes[self.current_player].append({
                "nom": nom_avion,
                "numero": numero,
                "role": role,
                "de_initial": de,
                "pilot_skill": pilot_skill
            })
            self._update_selected_planes_display()

        def _update_selected_planes_display(self):
            """Met à jour l'affichage des avions sélectionnés"""
            for widget in self.selected_planes_frame.winfo_children():
                widget.destroy()
            
            for avion in self.avions_selectionnes[self.current_player]:
                text = f"{avion['numero']}. {avion['nom']} ({avion['role']})"
                ttk.Label(self.selected_planes_frame, text=text).grid(
                    row=avion['numero']-1, column=0, padx=5, pady=2, sticky=tk.W)

        def _next_player(self):
            """Passe au joueur suivant ou termine la sélection"""
            if not self.avions_selectionnes.get(self.current_player, []):
                messagebox.showerror("Erreur", "Vous devez sélectionner au moins un avion (leader)")
                return
            
            self.player_data[self.current_player] = {
                "pays": self.pays_selectionne.get(),
                "avions": self.avions_selectionnes[self.current_player]
            }
            
            if self.current_player < self.nombre_joueurs:
                self.current_player += 1
                if self.current_player not in self.avions_selectionnes:
                    self.avions_selectionnes[self.current_player] = []
                self._show_player_selection()
            else:
                self._save_game_data()

        def _save_game_data(self):
            """Sauvegarde les données de la partie et lance l'initiative"""
            try:
                game_data = {
                    "nombre_joueurs": self.nombre_joueurs,
                    "joueurs": {}
                }
                
                resume = "Résumé des sélections:\n\n"
                
                for player_num, data in self.player_data.items():
                    game_data["joueurs"][str(player_num)] = {
                        "pays": data["pays"],
                        "avions": {}
                    }
                    
                    resume += f"Joueur {player_num} ({data['pays']}):\n"
                    
                    for avion in data["avions"]:
                        specs_avion = config_data["avion_chasseur"][avion["nom"]].copy()
                        
                        avion_data = {
                            "nom": avion["nom"],
                            "PV_actuel": specs_avion["PV"],
                            "role": avion["role"],
                            "de_initial": avion["de_initial"],
                            "pilot_skill": avion["pilot_skill"],
                            "energie": 1,
                            "initiative": 0,
                            "equipe": specs_avion["Equipe"],
                            "armes": specs_avion["Armes"],
                            "critiques_subis": [],
                            "statut": "actif"
                        }
                        
                        game_data["joueurs"][str(player_num)]["avions"][str(avion["numero"])] = avion_data
                        
                        resume += f"  Avion {avion['numero']} - {avion['nom']} ({avion['role']}) - Pilot Skill: {avion['pilot_skill']} (dé: {avion['de_initial']})\n"
                    
                    resume += "\n"
                
                config_data["In_game"] = game_data
                
                with open('config.json', 'w', encoding='utf-8') as f:
                    json.dump(config_data, f, indent=4, ensure_ascii=False)
                    
                    self.window.destroy()
                
                # Afficher le résumé
                resume_window = tk.Toplevel(self.parent.root)
                resume_window.title("Résumé des sélections")
                resume_window.geometry("400x600")
                
                resume_frame = ttk.Frame(resume_window, padding="20")
                resume_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
                
                resume_text = tk.Text(resume_frame, wrap=tk.WORD, width=40, height=20)
                resume_text.insert('1.0', resume)
                resume_text.config(state='disabled')
                resume_text.grid(row=0, column=0, columnspan=2, pady=10)
                
                button_frame = ttk.Frame(resume_frame)
                button_frame.grid(row=1, column=0, columnspan=2, pady=20)
                
                ttk.Button(button_frame, text="Commencer la partie", 
                          command=lambda: [
                              resume_window.destroy(), 
                              self.parent.GamePhaseManager(self.parent).start_game()
                          ]).grid(row=0, column=0, padx=10)
                
                ttk.Button(button_frame, text="Retour au menu principal", 
                          command=lambda: [resume_window.destroy(), self.parent.root.deiconify()]).grid(row=0, column=1, padx=10)
            except Exception as e:
                logging.error(f'Erreur lors de la sauvegarde des données: {str(e)}')
                messagebox.showerror("Erreur", f"Une erreur est survenue lors de la sauvegarde: {str(e)}")
            
    def start_new_game(self):
        """Lance une nouvelle partie"""
        # Ne pas cacher la fenêtre principale
        # self.root.withdraw()
        game_manager = self.NewGameManager(self)
        game_manager.start()

    def continue_game(self):
        """Continue la partie avec la configuration existante"""
        try:
            # Vérifier si une configuration existe
            if not config_data.get("In_game") or not config_data["In_game"].get("joueurs"):
                messagebox.showerror("Erreur", "Aucune partie en cours. Veuillez commencer une nouvelle partie.")
                return
                
            # Ne pas cacher la fenêtre principale
            # self.root.withdraw()
            
            # Lancer le gestionnaire de phases avec l'état sauvegardé
            game_phase_manager = self.GamePhaseManager(self)
            
            # Récupérer le numéro du round sauvegardé
            game_phase_manager.round_number = config_data["In_game"].get("current_round", 1)
            
            # Démarrer le jeu
            game_phase_manager.start_game()
            
        except Exception as e:
            logging.error(f'Erreur lors de la reprise de la partie: {str(e)}')
            messagebox.showerror("Erreur", "Impossible de reprendre la partie")
            self.root.deiconify()  # Réafficher le menu principal en cas d'erreur

    class GamePhaseManager:
        def __init__(self, parent):
            self.parent = parent
            self.root = parent.root
            self.round_number = 1
            self.current_phase = None
            self.window = None
            self.style = ttk.Style()
            self.style.configure('Destructive.TButton', foreground='red')

        def configure_window(self, window, title):
            """Configure une fenêtre avec barre de défilement et taille adaptée à l'écran"""
            # Obtenir les dimensions de l'écran
            screen_width = window.winfo_screenwidth()
            screen_height = window.winfo_screenheight()
            
            # Définir la taille de la fenêtre (80% de l'écran)
            window_width = int(screen_width * 0.8)
            window_height = int(screen_height * 0.8)
            
            # Calculer la position pour centrer la fenêtre
            x = (screen_width - window_width) // 2
            y = (screen_height - window_height) // 2
            
            # Configurer la fenêtre
            window.title(title)
            window.geometry(f"{window_width}x{window_height}+{x}+{y}")
            
            # Créer un canvas avec barre de défilement
            canvas = tk.Canvas(window)
            scrollbar = ttk.Scrollbar(window, orient="vertical", command=canvas.yview)
            scrollable_frame = ttk.Frame(canvas)
            
            # Configurer le canvas
            scrollable_frame.bind(
                "<Configure>",
                lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
            )
            canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
            canvas.configure(yscrollcommand=scrollbar.set)
            
            # Placer le canvas et la barre de défilement
            canvas.pack(side="left", fill="both", expand=True)
            scrollbar.pack(side="right", fill="y")
            
            # Ajouter la molette de la souris pour le défilement
            def _on_mousewheel(event):
                canvas.yview_scroll(int(-1*(event.delta/120)), "units")
            canvas.bind_all("<MouseWheel>", _on_mousewheel)
            
            return scrollable_frame

        def _reload_game_data(self):
            """Recharge les données du jeu depuis le fichier JSON"""
            try:
                logging.info('Rechargement des données du jeu depuis config.json')
                with open('config.json', 'r', encoding='utf-8') as f:
                    global config_data
                    config_data = json.load(f)
                
                # Vérification des données
                if not config_data.get("In_game") or not config_data["In_game"].get("joueurs"):
                    raise ValueError("Données de jeu invalides ou manquantes")
                
                logging.info('Données du jeu rechargées avec succès')
                return True
            except Exception as e:
                logging.error(f'Erreur lors du rechargement des données: {str(e)}')
                messagebox.showerror("Erreur", 
                    "Impossible de charger les données du jeu.\n"
                    f"Erreur: {str(e)}")
                return False

        def start_game(self):
            """Démarre le jeu avec la phase d'initiative"""
            logging.info(f'Démarrage du round {self.round_number}')
            
            # Recharger les données avant de commencer
            if not self._reload_game_data():
                self.parent.root.deiconify()
                return
            
            # Vérifier la phase sauvegardée et reprendre à la bonne phase
            current_phase = config_data["In_game"].get("current_phase", "initiative")
            
            if current_phase == "movement":
                self.create_movement_window()
            elif current_phase == "attack":
                self.start_attack_phase()
            elif current_phase == "end":
                self.start_end_phase()
            else:  # Par défaut ou "initiative"
                self.open_initiative()

        def open_initiative(self):
            """Phase 1: Initiative"""
            if not self._reload_game_data():
                self.parent.root.deiconify()
                return
                
            self.current_phase = "initiative"
            self.window = tk.Toplevel(self.parent.root)
            
            # Utiliser la nouvelle configuration de fenêtre
            main_frame = self.configure_window(self.window, f"Phase d'Initiative - Round {self.round_number}")
            
            # Calcul des initiatives
            all_planes = self._calculate_all_initiatives()
            
            # Frame pour l'ordre d'initiative en haut
            initiative_order_frame = ttk.Frame(main_frame)
            initiative_order_frame.grid(row=0, column=0, columnspan=3, pady=(0, 20), sticky="ew")
            
            # Titre principal
            title = ttk.Label(main_frame, text=f"Détails des initiatives - Round {self.round_number}", 
                            font=('Helvetica', 16, 'bold'))
            title.grid(row=1, column=0, columnspan=2, pady=(0, 20))
            
            # Affichage détaillé des initiatives
            self._display_initiative_order(main_frame, all_planes)
            
            # Boutons de navigation
            button_frame = ttk.Frame(main_frame)
            button_frame.grid(row=3, column=0, columnspan=2, pady=20)
            
            ttk.Button(button_frame, text="Phase de déplacement", 
                      command=self.start_movement_phase).grid(row=0, column=0, padx=10)
            
            ttk.Button(button_frame, text="Retour au menu", 
                      command=lambda: [self.window.destroy(), self.parent.root.deiconify()]).grid(row=0, column=1, padx=10)

        def _calculate_all_initiatives(self):
            """Calcule l'initiative pour tous les avions actifs"""
            all_planes = []
            for player_num, player_data in config_data["In_game"]["joueurs"].items():
                for plane_num, plane_data in player_data["avions"].items():
                    if plane_data["statut"] != "détruit":
                        # Lancer de dé d'initiative (1-10) avec explosion sur 10
                        initiative_roll = random.randint(1, 10)
                        total_roll = 0
                        explosion_count = 0
                        
                        # Tant qu'on fait 10, on relance et on ajoute
                        while initiative_roll == 10:
                            explosion_count += 1
                            initiative_roll = random.randint(1, 10)
                            total_roll += 10
                        total_roll += initiative_roll
                        
                        
                        # Log du résultat des dés
                        if explosion_count > 0:
                            logging.info(f'[INITIATIVE] {plane_data["nom"]} (J{player_num}-A{plane_num}) : Dé explosif! {explosion_count} explosion(s), résultat final: {total_roll}')
                        
                        # Base : pilot_skill + dé + énergie
                        initiative = plane_data["pilot_skill"] + total_roll + plane_data["energie"]
                        
                        # Malus de menace
                        menace = plane_data.get("menace", "aucune")
                        if menace == "dos":
                            initiative -= 4  # -4 si menacé dans le dos
                        elif menace == "flanc":
                            initiative -= 2  # -2 si menacé sur le flanc
                        
                        # Application des effets des critiques
                        for critique in plane_data["critiques_subis"]:
                            effet = config_data["Critique"].get(critique, {})
                            if isinstance(effet, dict) and "Init" in effet:
                                if effet["Init"] == "Premier":
                                    initiative = 0  # L'initiative devient 0 (dernier à jouer)
                                elif effet["Init"] == "-4":
                                    initiative -= 4  # Malus de -4 à l'initiative
                        
                        # Mise à jour de l'initiative dans les données
                        plane_data["initiative"] = initiative
                        
                        # Stockage des informations pour l'affichage
                        plane_info = {
                            "joueur": player_num,
                            "numero": plane_num,
                            "nom": plane_data["nom"],
                            "initiative": initiative,
                            "de": total_roll,  # On utilise le total des dés explosifs
                            "pilot_skill": plane_data["pilot_skill"],
                            "energie": plane_data["energie"],
                            "critiques": plane_data["critiques_subis"],
                            "menace": plane_data.get("menace", "aucune"),
                            "explosions": explosion_count  # Ajout du nombre d'explosions pour l'affichage
                        }
                        all_planes.append(plane_info)
            
            # Tri par initiative décroissante
            all_planes.sort(key=lambda x: x["initiative"], reverse=True)
            self.active_planes = all_planes
            return all_planes

        def _display_initiative_order(self, frame, planes):
            """Affiche l'ordre d'initiative avec tous les détails"""
            # Création du texte d'initiative
            initiative_text = tk.Text(frame, wrap=tk.WORD, width=80, height=40)
            
            for i, plane in enumerate(planes, 1):
                # Ligne principale avec l'avion et son initiative totale
                text = f"{i}. Joueur {plane['joueur']} - Avion {plane['numero']} ({plane['nom']})\n"
                text += f"   Initiative: {plane['initiative']} = {plane['pilot_skill']} (PS) + {plane['de']} (dé"
                
                # Ajouter l'information sur les explosions si il y en a eu
                if plane.get('explosions', 0) > 0:
                    text += f" avec {plane['explosions']} explosion{'s' if plane['explosions'] > 1 else ''}"
                text += f") + {plane['energie']} (E)"
                
                # Ajout des modificateurs de menace
                if plane.get("menace") == "dos":
                    text += " - 4 (menacé dans le dos)"
                elif plane.get("menace") == "flanc":
                    text += " - 2 (menacé sur le flanc)"
                else:
                    text += " - 0 (aucune menace)"
                
                # Ajout des modificateurs de critique
                modifiers = []
                for critique in plane["critiques"]:
                    effet = config_data["Critique"].get(critique, {})
                    if isinstance(effet, dict) and "Init" in effet:
                        if effet["Init"] == "Premier":
                            modifiers.append("Initiative forcée à 0 (Premier)")
                        elif effet["Init"] == "-4":
                            modifiers.append("-4 (Critique)")
                
                if modifiers:
                    text += "\n   → " + ", ".join(modifiers)
                else:
                    text += " - 0 (aucun modificateur)"
                
                text += "\n\n"
                initiative_text.insert(tk.END, text)
            
            initiative_text.config(state='disabled')
            initiative_text.grid(row=2, column=0, columnspan=2, pady=10)  # Changé row=1 en row=2
            
        def start_movement_phase(self):
            """Phase 2: Déplacement"""
            self.current_phase = "movement"
            # Sauvegarder l'état du jeu
            config_data["In_game"]["current_phase"] = "movement"
            with open('config.json', 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)
            self.window.destroy()
            self.create_movement_window()

        def bind_keyboard_navigation(self, window):
            """Ajoute les raccourcis clavier pour la navigation"""
            window.bind('<Left>', lambda e: self.handle_keyboard_navigation('previous'))
            window.bind('<Right>', lambda e: self.handle_keyboard_navigation('next'))

        def handle_keyboard_navigation(self, direction):
            """Gère la navigation au clavier entre les avions"""
            if hasattr(self, 'current_phase'):
                if self.current_phase == "movement":
                    if direction == 'previous':
                        self.previous_plane()
                    else:
                        self.next_plane()
                elif self.current_phase == "attack":
                    if direction == 'previous':
                        self.previous_attack()
                    else:
                        self.next_attack()
                elif self.current_phase == "end":
                    if direction == 'previous':
                        self.previous_end_phase_plane()
                    else:
                        self.next_end_phase_plane()

        def bind_keyboard_shortcuts(self, window):
            """Ajoute tous les raccourcis clavier"""
            # Navigation avec les flèches
            window.bind('<Left>', lambda e: self.handle_keyboard_navigation('previous'))
            window.bind('<Right>', lambda e: self.handle_keyboard_navigation('next'))
            # Validation avec Entrée
            window.bind('<Return>', lambda e: self.handle_enter_key())

        def handle_enter_key(self):
            """Gère l'appui sur la touche Entrée"""
            if hasattr(self, 'current_phase'):
                if self.current_phase == "movement":
                    # Vérifier si tous les choix d'énergie sont faits
                    all_choices_made = all(plane["choix_energie"].get() != "non_choisi" for plane in self.round_planes)
                    if all_choices_made:
                        self.apply_energy_changes()
                elif self.current_phase == "attack":
                    # Vérifier si toutes les actions sont faites
                    all_actions_done = all(len(actions) > 0 for actions in self.plane_actions.values())
                    if all_actions_done:
                        self.finish_attack_phase(self.window)
                elif self.current_phase == "end":
                    # Vérifier si toutes les menaces sont définies
                    all_threats_set = True
                    for plane in self.end_phase_planes:
                        plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
                        if "menace" not in plane_data:
                            all_threats_set = False
                            break
                    if all_threats_set:
                        self.finish_round()
        
        def update_selection_indicator(self, index, phase_planes, canvas_color=None):
            """Met à jour l'indicateur de sélection pour tous les avions
            
            Args:
                index: Index de l'avion sélectionné
                phase_planes: Liste des avions de la phase
                canvas_color: Couleur du carré (optionnel)
            """
            for i, plane in enumerate(phase_planes):
                if "status_canvas" in plane:
                    canvas = plane["status_canvas"]
                    canvas.delete("all")
                    
                    # Déterminer la couleur de fond selon la phase et l'état
                    fill_color = "white"
                    if self.current_phase == "movement":
                        # Phase de mouvement : vert si un choix d'énergie a été fait
                        if plane["choix_energie"].get() != "non_choisi":
                            fill_color = "green"
                    elif self.current_phase == "attack":
                        # Phase d'attaque : vert si une action a été définie
                        plane_id = f"{plane['joueur']}-{plane['numero']}"
                        if plane_id in self.plane_actions and self.plane_actions[plane_id]:
                            fill_color = "green"
                    elif self.current_phase == "end":
                        # Phase de fin : vert si une menace a été définie
                        plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
                        if "menace" in plane_data:
                            fill_color = "green"
                    
                    # Dessiner le rectangle avec la couleur appropriée
                    if i == index:
                        canvas.create_rectangle(2, 2, 18, 18, fill=fill_color, outline="blue", width=2)
                    else:
                        canvas.create_rectangle(2, 2, 18, 18, fill=fill_color, outline="gray", width=2)

        def create_movement_window(self):
            """Crée la fenêtre de la phase de déplacement"""
            self.current_phase = "movement"
            self.window = tk.Toplevel(self.parent.root)
            
            # Utiliser la nouvelle configuration de fenêtre
            main_frame = self.configure_window(self.window, f"Phase de Déplacement - Round {self.round_number}")
            
            # Ajouter les raccourcis clavier
            self.bind_keyboard_shortcuts(self.window)
            
            # Récupérer tous les avions triés par initiative
            all_planes = []
            for player_num, player_data in config_data["In_game"]["joueurs"].items():
                for plane_num, plane_data in player_data["avions"].items():
                    if plane_data["statut"] != "détruit":
                        all_planes.append({
                            "joueur": player_num,
                            "numero": plane_num,
                            "nom": plane_data["nom"],
                            "initiative": plane_data["initiative"],
                            "energie": plane_data["energie"],
                            "choix_energie": tk.StringVar(value="non_choisi"),
                            "status_canvas": None
                        })
            
            # Trier par initiative croissante
            all_planes.sort(key=lambda x: x["initiative"])
            self.round_planes = all_planes
            self.current_plane_index = 0
            
            # Frame pour l'ordre d'initiative
            initiative_frame = ttk.Frame(main_frame)
            initiative_frame.grid(row=0, column=0, columnspan=3, pady=(0, 20), sticky="ew")
            
            # Afficher l'ordre d'initiative
            for i, plane in enumerate(all_planes):
                frame = ttk.Frame(initiative_frame)
                frame.grid(row=0, column=i, padx=5)
                
                # Affichage du numéro de joueur et d'avion
                ttk.Label(frame, text=f"J{plane['joueur']}-A{plane['numero']}").grid(row=0, column=0)
                ttk.Label(frame, text=f"({plane['initiative']})").grid(row=1, column=0)
                
                # Canvas pour le statut (carré qui devient vert)
                status_canvas = tk.Canvas(frame, width=20, height=20)
                status_canvas.grid(row=2, column=0, pady=5)
                plane["status_canvas"] = status_canvas
            
            # Mettre à jour l'indicateur de sélection pour le premier avion
            self.update_selection_indicator(self.current_plane_index, self.round_planes)
            
            # Frame pour l'avion actuel
            self.current_plane_frame = ttk.LabelFrame(main_frame, text="Choix d'énergie", padding="10")
            self.current_plane_frame.grid(row=1, column=0, columnspan=3, pady=20, sticky="ew")
            
            # Frame pour les choix d'énergie
            energy_frame = ttk.Frame(self.current_plane_frame)
            energy_frame.grid(row=1, column=0, columnspan=4, pady=10)
            
            # Boutons pour les choix d'énergie
            energy_choices = [
                ("+2", "Gagner 2 énergies"),
                ("+1", "Gagner 1 énergie"),
                ("0", "Pas de changement"),
                ("-1", "Perdre 1 énergie"),
                ("-2", "Perdre 2 énergies")
            ]
            
            for i, (value, text) in enumerate(energy_choices):
                ttk.Button(energy_frame, text=text, 
                          command=lambda v=value: self.set_energy_choice(v)).grid(row=1, column=i, padx=5)
            
             # Boutons de navigation
            damage_frame = ttk.Frame(self.current_plane_frame)
            damage_frame.grid(row=2, column=0, columnspan=4, pady=10)
            ttk.Button(damage_frame, text="Appliquer des dégâts", 
                      command=self.apply_movement_damage).grid(row=0, column=0)
            self.movement_damage_entry = ttk.Entry(damage_frame, width=5)
            self.movement_damage_entry.grid(row=0, column=1, padx=5)
            
            # Frame pour les critiques qui peuvent être enlevés
            self.critiques_frame = ttk.LabelFrame(main_frame, text="Critiques à enlever", padding="10")
            self.critiques_frame.grid(row=2, column=0, columnspan=3, pady=20, sticky="ew")
            
            # Boutons de navigation
            nav_frame = ttk.Frame(self.current_plane_frame)
            nav_frame.grid(row=3, column=0, columnspan=4, pady=10)
            
            ttk.Button(nav_frame, text="← Précédent", 
                      command=self.previous_plane).grid(row=0, column=0, padx=10)
            ttk.Button(nav_frame, text="Suivant →", 
                      command=self.next_plane).grid(row=0, column=1, padx=10)
            
            # Bouton de validation
            self.validate_button = ttk.Button(main_frame, text="Valider les changements d'énergie", 
                                            command=self.apply_energy_changes)
            self.validate_button.grid(row=4, column=0, columnspan=3, pady=20)
            self.validate_button.grid_remove()
            
            # Mettre à jour l'affichage de l'avion actuel
            self.update_current_plane_display()
            self.update_removable_critiques_frame()

        def update_current_plane_display(self):
            """Met à jour l'affichage de l'avion actuel dans la phase de mouvement"""
            
            # Nettoyer le frame
            for widget in self.current_plane_frame.winfo_children():
                if isinstance(widget, ttk.Label):  # Ne supprime que les labels, pas les boutons
                    widget.destroy()
            
            plane = self.round_planes[self.current_plane_index]
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Afficher les informations de l'avion
            text = f"Joueur {plane['joueur']} - Avion {plane['numero']} ({plane_data['nom']})\n"
            text += f"Pilot Skill: {plane_data['pilot_skill']}\n"
            text += f"PV actuels: {plane_data['PV_actuel']}\n"
            text += f"Énergie actuelle: {plane_data['energie']}\n"
            text += "Critiques: " + (", ".join(plane_data["critiques_subis"]) if plane_data["critiques_subis"] else "Aucun")
            
            # Ajouter le choix d'énergie s'il a été fait
            choix = plane["choix_energie"].get()
            if choix != "non_choisi":
                if choix == "+2":
                    text += "\n\nChoix d'énergie: Gagner 2 énergies"
                elif choix == "+1":
                    text += "\n\nChoix d'énergie: Gagner 1 énergie"
                elif choix == "0":
                    text += "\n\nChoix d'énergie: Pas de changement"
                elif choix == "-1":
                    text += "\n\nChoix d'énergie: Perdre 1 énergie"
                elif choix == "-2":
                    text += "\n\nChoix d'énergie: Perdre 2 énergies"
            else:
                text += "\n\nChoix d'énergie: Aucun choix fait"
            
            ttk.Label(self.current_plane_frame, text=text).grid(row=0, column=0, columnspan=4, padx=10, pady=10)
            
            # Mettre à jour les boutons de critiques
            self.update_removable_critiques_frame()

        def previous_plane(self):
            """Passe à l'avion précédent"""
            if self.current_plane_index > 0:
                # Réinitialiser le carré de l'avion actuel
                current_plane = self.round_planes[self.current_plane_index]
                if "status_canvas" in current_plane:
                    canvas = current_plane["status_canvas"]
                    canvas.delete("all")
                    canvas.create_rectangle(2, 2, 18, 18, fill="white", outline="gray", width=2)
                
                self.current_plane_index -= 1
                self.update_current_plane_display()
                self.update_selection_indicator(self.current_plane_index, self.round_planes)

        def next_plane(self):
            """Passe à l'avion suivant"""
            if self.current_plane_index < len(self.round_planes) - 1:
                # Réinitialiser le carré de l'avion actuel
                current_plane = self.round_planes[self.current_plane_index]
                if "status_canvas" in current_plane:
                    canvas = current_plane["status_canvas"]
                    canvas.delete("all")
                    canvas.create_rectangle(2, 2, 18, 18, fill="white", outline="gray", width=2)
                
                self.current_plane_index += 1
                self.update_current_plane_display()
                self.update_selection_indicator(self.current_plane_index, self.round_planes)

        def set_energy_choice(self, choice):
            """Définit le choix d'énergie pour l'avion actuel"""
            current_plane = self.round_planes[self.current_plane_index]
            current_plane["choix_energie"].set(choice)
            plane_data = config_data["In_game"]["joueurs"][current_plane["joueur"]]["avions"][current_plane["numero"]]
            
            # Log du changement d'énergie
            logging.info(f'[ENERGIE] {plane_data["nom"]} (J{current_plane["joueur"]}-A{current_plane["numero"]}) : changement d\'énergie de {choice}')
            
            # Mettre à jour l'affichage
            self.update_current_plane_display()
            
            # Vérifier si tous les choix sont faits
            all_choices_made = all(plane["choix_energie"].get() != "non_choisi" for plane in self.round_planes)
            if all_choices_made:
                self.validate_button.grid()

            self.update_selection_indicator(self.current_plane_index, self.round_planes)

        def apply_energy_changes(self):
            """Applique et sauvegarde les changements d'énergie"""
            try:
                # Log du début de la phase
                logging.info(f'[PHASE] Fin de la phase d\'énergie - Round {self.round_number}')
                
                # Appliquer les changements d'énergie dans config_data
                for plane in self.round_planes:
                    choice = plane["choix_energie"].get()
                    if choice != "non_choisi":
                        current_energy = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]["energie"]
                        new_energy = current_energy + int(choice)
                        # S'assurer que l'énergie ne descend pas en dessous de 0
                        new_energy = max(0, new_energy)
                        config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]["energie"] = new_energy
                        
                        plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
                        logging.info(f'[ENERGIE] {plane_data["nom"]} (J{plane["joueur"]}-A{plane["numero"]}) : énergie finale = {new_energy}')
                
                # Sauvegarder les modifications dans config.json
                with open('config.json', 'w', encoding='utf-8') as f:
                    json.dump(config_data, f, indent=4, ensure_ascii=False)
                
                # Passer à la phase d'attaque
                self.start_attack_phase()
            except Exception as e:
                logging.error(f'Erreur lors de la sauvegarde des modifications d\'énergie: {str(e)}')
                messagebox.showerror("Erreur", "Impossible de sauvegarder les modifications d'énergie")

        def start_attack_phase(self):
            # Vérifier à nouveau la victoire après les destructions par critique
            if self.check_victory():
                return
            
            self.current_phase = "attack"
            # Sauvegarder l'état du jeu
            config_data["In_game"]["current_phase"] = "attack"
            with open('config.json', 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)
            
            # Fermer toutes les fenêtres existantes sauf la principale
            for window in self.root.winfo_children():
                if isinstance(window, tk.Toplevel):
                    window.destroy()
            
            # Créer une nouvelle fenêtre pour la phase d'attaque
            attack_window = tk.Toplevel(self.parent.root)
            self.window = attack_window  # Garder une référence à la fenêtre
            
            # Utiliser la nouvelle configuration de fenêtre
            main_frame = self.configure_window(attack_window, f"Phase d'Attaque - Round {self.round_number}")
            
            # Filtrer les avions détruits et trier par initiative
            active_planes = self.filter_active_planes(self.round_planes)
            self.attack_planes = sorted(active_planes, key=lambda x: x["initiative"], reverse=True)
            self.current_attack_index = 0
            
            # Initialiser le dictionnaire des actions et des critiques temporaires
            self.plane_actions = {f"{plane['joueur']}-{plane['numero']}": [] for plane in self.attack_planes}
            self.temp_critiques = {f"{plane['joueur']}-{plane['numero']}": [] for plane in self.attack_planes}
            
            # Frame principal
            main_frame = ttk.Frame(main_frame, padding="20")
            main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
            
            # Frame pour l'ordre d'initiative
            initiative_frame = ttk.Frame(main_frame)
            initiative_frame.grid(row=0, column=0, columnspan=3, pady=(0, 20), sticky="ew")
            
            # Afficher l'ordre d'initiative (inversé)
            for i, plane in enumerate(self.attack_planes):
                frame = ttk.Frame(initiative_frame)
                frame.grid(row=0, column=i, padx=5)
                ttk.Label(frame, text=f"J{plane['joueur']}-A{plane['numero']}").grid(row=0, column=0)
                ttk.Label(frame, text=f"({plane['initiative']})").grid(row=1, column=0)
                
                # Canvas pour le statut
                status_canvas = tk.Canvas(frame, width=20, height=20)
                status_canvas.grid(row=2, column=0, pady=5)
                plane["status_canvas"] = status_canvas
            
            # Mettre à jour l'indicateur de sélection pour le premier avion
            self.update_selection_indicator(self.current_attack_index, self.attack_planes)
            
            # Frame pour l'avion actuel
            self.current_attack_frame = ttk.LabelFrame(main_frame, text="Avion actuel", padding="10")
            self.current_attack_frame.grid(row=1, column=0, columnspan=3, pady=20, sticky="ew")
            
            # Frame pour les choix d'attaque
            attack_frame = ttk.Frame(main_frame)
            attack_frame.grid(row=2, column=0, columnspan=3, pady=20)
            
            # Frame pour les actions d'attaque
            action_frame = ttk.Frame(attack_frame)
            action_frame.grid(row=0, column=0, columnspan=3, pady=10)
            
            ttk.Button(action_frame, text="Pas d'attaque", 
                    command=self.no_attack).grid(row=0, column=0, padx=10)
            
            damage_frame = ttk.Frame(action_frame)
            damage_frame.grid(row=0, column=1, padx=10)
            ttk.Button(damage_frame, text="Subit des dégâts", 
                    command=self.apply_damage).grid(row=0, column=0)
            self.damage_entry = ttk.Entry(damage_frame, width=5)
            self.damage_entry.grid(row=0, column=1, padx=5)
            
            ttk.Button(action_frame, text="Subit critique", 
                    command=self.apply_critical).grid(row=0, column=2, padx=10)
            
            # Nouveau bouton pour détruire directement l'avion
            ttk.Button(action_frame, text="Détruire l'avion", 
                      command=self.destroy_plane_directly,
                      style='Destructive.TButton').grid(row=0, column=3, padx=10)
            
            # Bouton de réinitialisation
            ttk.Button(attack_frame, text="Réinitialiser les attaques de cet avion", 
                    command=self.reset_current_plane_attacks).grid(row=1, column=0, columnspan=3, pady=10)
            
            # Boutons de navigation
            nav_frame = ttk.Frame(main_frame)
            nav_frame.grid(row=3, column=0, columnspan=3, pady=20)
            
            ttk.Button(nav_frame, text="←", command=self.previous_attack).grid(row=0, column=0, padx=10)
            ttk.Button(nav_frame, text="→", command=self.next_attack).grid(row=0, column=2, padx=10)
            
            # Frame pour les boutons de validation
            validation_frame = ttk.Frame(main_frame)
            validation_frame.grid(row=4, column=0, columnspan=3, pady=20)
            
            # Bouton "Plus d'attaque"
            ttk.Button(validation_frame, text="Plus d'attaque ce tour", 
                    command=self.mark_remaining_as_no_attack).grid(row=0, column=0, padx=10)
            
            # Bouton de validation
            self.validate_attack_button = ttk.Button(validation_frame, text="Valider les attaques", 
                                                   command=lambda: self.finish_attack_phase(attack_window))
            self.validate_attack_button.grid(row=0, column=1, padx=10)
            self.validate_attack_button.config(state='disabled')  # Désactivé par défaut
            
            # Mettre à jour l'affichage de l'avion actuel
            self.update_current_attack_display()
            
        def update_current_attack_display(self):
            """Met à jour l'affichage de l'avion actuel dans la phase d'attaque"""
            # Nettoyer le frame
            for widget in self.current_attack_frame.winfo_children():
                widget.destroy()
            
            plane = self.attack_planes[self.current_attack_index]
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            plane_id = f"{plane['joueur']}-{plane['numero']}"
            
            # Mettre à jour l'indicateur visuel
            self.update_selection_indicator(self.current_attack_index, self.attack_planes)
            
            # Afficher les informations de l'avion
            text = f"Joueur {plane['joueur']} - Avion {plane['numero']} ({plane_data['nom']})\n"
            text += f"Pilot Skill: {plane_data['pilot_skill']}\n"
            text += f"PV actuels: {plane_data['PV_actuel']}\n"
            text += "Critiques actuels: " + (", ".join(plane_data['critiques_subis']) if plane_data['critiques_subis'] else "Aucun")
            
            # Afficher les critiques temporaires s'il y en a
            if self.temp_critiques[plane_id]:
                text += "\nCritiques en attente: " + ", ".join(self.temp_critiques[plane_id])
            
            if self.plane_actions[plane_id]:
                text += "\n\nActions ce tour:"
                for action in self.plane_actions[plane_id]:
                    text += f"\n- {action}"
            
            ttk.Label(self.current_attack_frame, text=text).grid(row=0, column=0, padx=10, pady=10)

        def no_attack(self):
            """Marque l'avion comme n'effectuant pas d'attaque"""
            plane = self.attack_planes[self.current_attack_index]
            plane_id = f"{plane['joueur']}-{plane['numero']}"
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Vérifier si l'avion a déjà subi des dégâts ou des critiques
            if any(("Dégâts:" in action or "Critique" in action) for action in self.plane_actions.get(plane_id, [])):
                messagebox.showerror("Erreur", "Cet avion a déjà subi des dégâts ou des critiques. Impossible de mettre 'Pas d'attaque'.")
                return
                
            # Ajouter l'action
            self.plane_actions[plane_id] = ["Pas d'attaque"]  # Remplace toutes les actions précédentes
            self.temp_critiques[plane_id] = []  # Réinitialiser les critiques temporaires
            
            # Mettre à jour l'affichage
            self.update_current_attack_display()
            
            # Vérifier si tous les avions ont une action
            self.check_all_actions()

        def apply_damage(self):
            """Ajoute une action de dégâts pour l'avion actuel"""
            plane = self.attack_planes[self.current_attack_index]
            plane_id = f"{plane['joueur']}-{plane['numero']}"
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Vérifier si l'avion est marqué comme "Pas d'attaque"
            if any("Pas d'attaque" in action for action in self.plane_actions.get(plane_id, [])):
                messagebox.showerror("Erreur", "Cet avion est marqué comme 'Pas d'attaque'. Réinitialisez d'abord.")
                return
            
            try:
                damage = int(self.damage_entry.get())
                if damage <= 0:
                    messagebox.showerror("Erreur", "Les dégâts doivent être positifs")
                    return
                
                # Calculer les nouveaux PV sans les appliquer
                current_pv = int(plane_data["PV_actuel"])
                new_pv = max(0, current_pv - damage)
                
                # Ajouter l'action
                self.plane_actions[plane_id].append(f"Dégâts: {damage}")
                
                # Si les dégâts vont détruire l'avion, ajouter cette information
                if new_pv == 0:
                    self.plane_actions[plane_id].append("L'avion sera détruit")
                
                # Mettre à jour l'affichage
                self.update_current_attack_display()
                self.damage_entry.delete(0, tk.END)
                
                # Vérifier si tous les avions ont une action
                self.check_all_actions()
                
            except ValueError:
                messagebox.showerror("Erreur", "Veuillez entrer un nombre valide")

        def apply_critical(self):
            """Applique un critique à l'avion actuel"""
            plane = self.attack_planes[self.current_attack_index]
            plane_id = f"{plane['joueur']}-{plane['numero']}"
            
            # Vérifier si l'avion est marqué comme "Pas d'attaque"
            if any("Pas d'attaque" in action for action in self.plane_actions.get(plane_id, [])):
                messagebox.showerror("Erreur", "Cet avion est marqué comme 'Pas d'attaque'. Réinitialisez d'abord.")
                return
                
            # Créer une fenêtre pour le choix du critique
            critique_window = tk.Toplevel(self.window)  # Utiliser self.window comme parent au lieu de self.root
            critique_window.title("Appliquer un critique")
            critique_window.geometry("600x400")
            
            # Rendre la fenêtre de critique modale
            critique_window.transient(self.window)
            critique_window.grab_set()
            
            # Frame principal
            frame = ttk.Frame(critique_window, padding="20")
            frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
            
            # Variables
            self.type_avion = tk.StringVar(value="chasseur")
            self.type_arme = tk.StringVar(value="mitraillette")
            self.nombre = tk.StringVar(value="2")
            
            # Choix du type d'avion
            type_frame = ttk.LabelFrame(frame, text="Type d'avion", padding="10")
            type_frame.grid(row=1, column=0, columnspan=2, pady=10, sticky=(tk.W, tk.E))
            
            ttk.Radiobutton(type_frame, text="Chasseur", variable=self.type_avion, value="chasseur").grid(row=0, column=0, padx=10)
            ttk.Radiobutton(type_frame, text="Bombardier", variable=self.type_avion, value="bombeur").grid(row=0, column=1, padx=10)
            
            # Choix de l'arme
            arme_frame = ttk.LabelFrame(frame, text="Type d'arme", padding="10")
            arme_frame.grid(row=2, column=0, columnspan=2, pady=10, sticky=(tk.W, tk.E))
            
            ttk.Radiobutton(arme_frame, text="Mitraillette", variable=self.type_arme, value="mitraillette").grid(row=0, column=0, padx=10)
            ttk.Radiobutton(arme_frame, text="Canon", variable=self.type_arme, value="canon").grid(row=0, column=1, padx=10)
            
            # Choix du nombre
            nombre_frame = ttk.LabelFrame(frame, text="Nombre (2-12)", padding="10")
            nombre_frame.grid(row=3, column=0, columnspan=2, pady=10, sticky=(tk.W, tk.E))
            
            nombres = [str(i) for i in range(2, 13)]
            nombre_combobox = ttk.Combobox(nombre_frame, textvariable=self.nombre, values=nombres, state="readonly", width=5)
            nombre_combobox.grid(row=0, column=0, padx=10)
            
            # Bouton pour appliquer le critique
            ttk.Button(frame, text="Appliquer le critique", 
                    command=lambda: self.validate_critique(critique_window, plane)).grid(row=4, column=0, columnspan=2, pady=20)
            
        def validate_critique(self, window, plane):
            """Valide et applique le critique choisi"""
            type_avion = self.type_avion.get()
            type_arme = self.type_arme.get()
            nombre = self.nombre.get()
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]

            # Récupération du critique
            critique_dict = config_data[f'Critique_{type_avion}']
            critique_list = critique_dict[nombre]

            # Sélection du critique en fonction de l'arme
            critiques = []
            if isinstance(critique_list, list):
                if type_arme == "mitraillette":
                    if isinstance(critique_list[0], list):
                        critiques.extend(critique_list[0])
                    else:
                        critiques.append(critique_list[0])
                else:  # canon
                    if isinstance(critique_list[-1], list):
                        critiques.extend(critique_list[-1])
                    else:
                        critiques.append(critique_list[-1])
            else:
                critiques.append(critique_list)
                
            # Log des critiques (mais pas encore appliqués)
            logging.info(f'[CRITIQUE] {plane_data["nom"]} (J{plane["joueur"]}-A{plane["numero"]}) : critique(s) sélectionné(s) {", ".join(critiques)} (dé: {nombre}, arme: {type_arme})')
                
            # Stocker temporairement les critiques
            plane_id = f"{plane['joueur']}-{plane['numero']}"
            self.temp_critiques[plane_id].extend(critiques)

            # Ajouter l'action
            self.plane_actions[plane_id].append(f"Critique(s) sélectionné(s): {', '.join(critiques)}")

            # Fermer uniquement la fenêtre de critique
            window.grab_release()
            window.destroy()
            
            # Redonner le focus à la fenêtre d'attaque
            self.window.grab_set()
            
            # Mettre à jour l'affichage de la phase d'attaque
            self.update_current_attack_display()
            
            # Vérifier si tous les avions ont une action
            self.check_all_actions()

        def filter_active_planes(self, planes):
            """Filtre les avions actifs (non détruits)"""
            return [plane for plane in planes if config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]["statut"] != "détruit"]

        def previous_attack(self):
            """Passe à l'avion précédent dans la phase d'attaque"""
            if self.current_attack_index > 0:
                # Réinitialiser le carré de l'avion actuel
                current_plane = self.attack_planes[self.current_attack_index]
                if "status_canvas" in current_plane:
                    canvas = current_plane["status_canvas"]
                    canvas.delete("all")
                    canvas.create_rectangle(2, 2, 18, 18, fill="white", outline="gray", width=2)
                
                self.current_attack_index -= 1
                self.update_current_attack_display()
                self.update_selection_indicator(self.current_attack_index, self.attack_planes)

        def next_attack(self):
            """Passe à l'avion suivant dans la phase d'attaque"""
            if self.current_attack_index < len(self.attack_planes) - 1:
                # Réinitialiser le carré de l'avion actuel
                current_plane = self.attack_planes[self.current_attack_index]
                if "status_canvas" in current_plane:
                    canvas = current_plane["status_canvas"]
                    canvas.delete("all")
                    canvas.create_rectangle(2, 2, 18, 18, fill="white", outline="gray", width=2)
                
                self.current_attack_index += 1
                self.update_current_attack_display()
                self.update_selection_indicator(self.current_attack_index, self.attack_planes)

        def reset_current_plane_attacks(self):
            """Réinitialise les actions de l'avion actuel"""
            plane = self.attack_planes[self.current_attack_index]
            plane_id = f"{plane['joueur']}-{plane['numero']}"
            self.plane_actions[plane_id] = []
            self.temp_critiques[plane_id] = []  # Réinitialiser aussi les critiques temporaires
            
            # Mettre à jour l'affichage
            self.update_current_attack_display()
            self.validate_attack_button.config(state='disabled')

        def check_all_actions(self):
            """Vérifie si tous les avions ont une action et active le bouton de validation si c'est le cas"""
            all_have_actions = all(len(actions) > 0 for actions in self.plane_actions.values())
            self.validate_attack_button.config(state='normal' if all_have_actions else 'disabled')

        def mark_remaining_as_no_attack(self):
            """Marque tous les avions restants comme 'Pas d'attaque'"""
            for i in range(len(self.attack_planes)):
                plane = self.attack_planes[i]
                plane_id = f"{plane['joueur']}-{plane['numero']}"
                if not self.plane_actions[plane_id]:  # Si aucune action n'est définie
                    self.plane_actions[plane_id] = ["Pas d'attaque"]
                    plane["status_canvas"].create_rectangle(2, 2, 18, 18, fill="green", outline="darkgreen")
            self.update_current_attack_display()
            self.check_all_actions()

        def finish_attack_phase(self, window):
            """Termine la phase d'attaque et passe à la phase suivante"""
            try:
                # Appliquer toutes les actions
                for plane_id, actions in self.plane_actions.items():
                    joueur, numero = plane_id.split('-')
                    plane_data = config_data["In_game"]["joueurs"][joueur]["avions"][numero]
                    
                    for action in actions:
                        if action.startswith("Dégâts:"):
                            # Appliquer les dégâts
                            damage = int(action.split(": ")[1])
                            current_pv = int(plane_data["PV_actuel"])
                            new_pv = max(0, current_pv - damage)
                            plane_data["PV_actuel"] = str(new_pv)
                            logging.info(f'[DEGATS] {plane_data["nom"]} (J{joueur}-A{numero}) : subit {damage} dégâts (PV: {current_pv} -> {new_pv})')
                            
                            # Si les PV tombent à 0, marquer comme détruit
                            if new_pv == 0:
                                plane_data["statut"] = "détruit"
                                logging.info(f'[DESTRUCTION] {plane_data["nom"]} (J{joueur}-A{numero}) est détruit!')
                        
                        elif action == "Destruction directe":
                            # Marquer l'avion comme détruit
                            plane_data["PV_actuel"] = "0"
                            plane_data["statut"] = "détruit"
                            logging.info(f'[DESTRUCTION MANUELLE] {plane_data["nom"]} (J{joueur}-A{numero}) a été détruit manuellement')
                
                # Appliquer tous les critiques temporaires
                for plane_id, critiques in self.temp_critiques.items():
                    if critiques:
                        joueur, numero = plane_id.split('-')
                        plane_data = config_data["In_game"]["joueurs"][joueur]["avions"][numero]
                        plane_data["critiques_subis"].extend(critiques)
                        logging.info(f'[CRITIQUE] {plane_data["nom"]} (J{joueur}-A{numero}) : application des critiques {", ".join(critiques)}')

                # Sauvegarder les modifications dans config.json
                with open('config.json', 'w', encoding='utf-8') as f:
                    json.dump(config_data, f, indent=4, ensure_ascii=False)
                logging.info('Phase d\'attaque terminée et sauvegardée')
                
                # Fermer la fenêtre d'attaque
                window.destroy()
                
                # Passer à la phase suivante
                self.start_end_phase()
            except Exception as e:
                logging.error(f'Erreur lors de la finalisation de la phase d\'attaque: {str(e)}')
                messagebox.showerror("Erreur", "Impossible de sauvegarder les modifications")

        def generate_game_report(self):
            """Génère un rapport détaillé de la partie"""
            try:
                # Créer le dossier rapports s'il n'existe pas
                if not os.path.exists('rapports'):
                    os.makedirs('rapports')
                
                # Générer un nom de fichier unique avec la date et l'heure
                now = datetime.now()
                filename = f'rapports/rapport_partie_{now.strftime("%Y%m%d_%H%M%S")}.txt'
                
                # Récupérer tous les logs de la partie
                log_files = sorted([f for f in os.listdir('logs') if f.startswith('game_')])
                if not log_files:
                    messagebox.showerror("Erreur", "Aucun fichier de log trouvé pour cette partie")
                    return None
                
                latest_log = os.path.join('logs', log_files[-1])
                
                # Créer le rapport
                with open(latest_log, 'r', encoding='utf-8') as log_file, \
                     open(filename, 'w', encoding='utf-8') as report_file:
                    
                    # Écrire l'en-tête
                    report_file.write("=== RAPPORT DE PARTIE ===\n")
                    report_file.write(f"Date: {now.strftime('%d/%m/%Y %H:%M:%S')}\n\n")
                    
                    # Écrire un résumé de la partie
                    report_file.write("=== RÉSUMÉ DE LA PARTIE ===\n")
                    for joueur, data in config_data["In_game"]["joueurs"].items():
                        report_file.write(f"\nJoueur {joueur} ({data.get('pays', 'Pays non spécifié')})\n")
                        for num_avion, avion in data["avions"].items():
                            status = "Détruit" if avion["statut"] == "détruit" else "Actif"
                            report_file.write(f"- Avion {num_avion} ({avion['nom']}): {status}\n")
                            if avion["statut"] != "détruit":
                                report_file.write(f"  PV: {avion['PV_actuel']}\n")
                                report_file.write(f"  Énergie: {avion['energie']}\n")
                                report_file.write(f"  Critiques: {', '.join(avion['critiques_subis']) if avion['critiques_subis'] else 'Aucun'}\n")
                    
                    report_file.write("\n=== DÉROULEMENT DÉTAILLÉ ===\n\n")
                    
                    # Copier les logs en les organisant par catégorie
                    logs_by_category = {
                        "ROUND": [],
                        "PHASE": [],
                        "ENERGIE": [],
                        "ATTAQUE": [],
                        "DEGATS": [],
                        "CRITIQUE": [],
                        "MENACE": [],
                        "DESTRUCTION": [],
                        "ETAT": [],
                        "VICTOIRE": [],
                        "MATCH NUL": [],
                        "SAUVEGARDE": []
                    }
                    
                    for line in log_file:
                        # Extraire la catégorie du log
                        for category in logs_by_category.keys():
                            if f"[{category}]" in line:
                                logs_by_category[category].append(line.strip())
                                break
                    
                    # Écrire les logs organisés
                    for category, logs in logs_by_category.items():
                        if logs:
                            report_file.write(f"\n--- {category} ---\n")
                            for log in logs:
                                report_file.write(f"{log}\n")
                
                return filename
                
            except Exception as e:
                logging.error(f'Erreur lors de la génération du rapport: {str(e)}')
                messagebox.showerror("Erreur", "Impossible de générer le rapport de partie")
                return None

        def check_victory(self):
            """Vérifie si une équipe a gagné la partie"""
            # Créer un dictionnaire pour compter les avions actifs par équipe
            equipes_actives = {}
            
            # Parcourir tous les joueurs et leurs avions
            for joueur, data in config_data["In_game"]["joueurs"].items():
                for num_avion, avion in data["avions"].items():
                    if avion["statut"] != "détruit":
                        equipe = avion["equipe"]
                        if equipe not in equipes_actives:
                            equipes_actives[equipe] = 0
                        equipes_actives[equipe] += 1
                        logging.info(f'[ETAT] {avion["nom"]} (J{joueur}-A{num_avion}) de l\'équipe {equipe} est toujours actif')
            
            # Si une seule équipe a des avions actifs, elle gagne
            if len(equipes_actives) == 1:
                equipe_gagnante = list(equipes_actives.keys())[0]
                logging.info(f'[VICTOIRE] L\'équipe {equipe_gagnante} remporte la partie avec {equipes_actives[equipe_gagnante]} avion(s) restant(s)!')
                
                # Générer le rapport
                rapport_file = self.generate_game_report()
                if rapport_file:
                    message = f"L'équipe {equipe_gagnante} remporte la partie!\n\nUn rapport détaillé de la partie a été généré:\n{rapport_file}"
                else:
                    message = f"L'équipe {equipe_gagnante} remporte la partie!"
                
                messagebox.showinfo("Victoire!", message)
                
                # Fermer toutes les fenêtres sauf la principale
                for window in self.root.winfo_children():
                    if isinstance(window, tk.Toplevel):
                        window.destroy()
                self.parent.root.deiconify()  # Réafficher le menu principal
                return True
            elif len(equipes_actives) == 0:
                logging.info('[MATCH NUL] Toutes les équipes ont été détruites!')
                
                # Générer le rapport
                rapport_file = self.generate_game_report()
                if rapport_file:
                    message = f"Match nul! Toutes les équipes ont été détruites!\n\nUn rapport détaillé de la partie a été généré:\n{rapport_file}"
                else:
                    message = "Match nul! Toutes les équipes ont été détruites!"
                
                messagebox.showinfo("Match nul!", message)
                
                # Fermer toutes les fenêtres sauf la principale
                for window in self.root.winfo_children():
                    if isinstance(window, tk.Toplevel):
                        window.destroy()
                self.parent.root.deiconify()  # Réafficher le menu principal
                return True
            return False

        def check_lethal_criticals(self):
            """Vérifie et applique les critiques mortels"""
            for joueur, data in config_data["In_game"]["joueurs"].items():
                for num_avion, avion in data["avions"].items():
                    if avion["statut"] != "détruit":  # Vérifier uniquement les avions non détruits
                        for critique in avion["critiques_subis"]:
                            effet = config_data["Critique"].get(critique, {})
                            if isinstance(effet, dict) and effet.get("Dégat") == "Mort":
                                # Sauvegarder l'ancien PV pour le log
                                old_pv = avion["PV_actuel"]
                                # Détruire l'avion
                                avion["PV_actuel"] = "0"
                                avion["statut"] = "détruit"
                                # Logger la destruction
                                logging.info(f'[DESTRUCTION PAR CRITIQUE] {avion["nom"]} (J{joueur}-A{num_avion}) a été détruit par le critique "{critique}" (PV: {old_pv} -> 0)')
                                # Informer le joueur
                                messagebox.showinfo("Destruction par critique", 
                                    f'L\'avion {avion["nom"]} (Joueur {joueur}, Avion {num_avion}) a été détruit à cause du critique "{critique}"!')

        def reset_threats(self):
            """Réinitialise toutes les menaces des avions actifs"""
            for joueur, data in config_data["In_game"]["joueurs"].items():
                for num_avion, avion in data["avions"].items():
                    if avion["statut"] != "détruit":
                        if "menace" in avion:
                            old_menace = avion["menace"]
                            if old_menace != "aucune":
                                logging.info(f'[MENACE RÉINITIALISÉE] {avion["nom"]} (J{joueur}-A{num_avion}) : {old_menace} -> supprimée')
                            del avion["menace"]  # Supprime la clé menace au lieu de lui donner une valeur

        def start_end_phase(self):
            """Phase de fin de tour"""
            self.current_phase = "end"
            config_data["In_game"]["current_phase"] = "end"
            with open('config.json', 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)
            
            if self.check_victory():
                return
            
            self.check_lethal_criticals()
            
            if self.check_victory():
                return
            
            self.reset_threats()
            
            # Fermer toutes les fenêtres existantes sauf la principale
            for window in self.root.winfo_children():
                if isinstance(window, tk.Toplevel):
                    window.destroy()
            
            # Créer une nouvelle fenêtre
            self.window = tk.Toplevel(self.root)
            
            # Utiliser la nouvelle configuration de fenêtre
            main_frame = self.configure_window(self.window, f"Phase de Fin - Round {self.round_number}")
            
            # Récupérer tous les avions actifs triés par initiative
            active_planes = self.filter_active_planes(self.round_planes)
            self.end_phase_planes = sorted(active_planes, key=lambda x: x["initiative"])
            self.current_end_phase_index = 0
            
            # Frame pour l'ordre d'initiative
            initiative_frame = ttk.Frame(main_frame)
            initiative_frame.grid(row=0, column=0, columnspan=3, pady=(0, 20), sticky="ew")
            
            # Afficher l'ordre d'initiative
            for i, plane in enumerate(self.end_phase_planes):
                frame = ttk.Frame(initiative_frame)
                frame.grid(row=0, column=i, padx=5)
                
                # Affichage du numéro de joueur et d'avion
                ttk.Label(frame, text=f"J{plane['joueur']}-A{plane['numero']}").grid(row=0, column=0)
                ttk.Label(frame, text=f"({plane['initiative']})").grid(row=1, column=0)
                
                # Canvas pour le statut
                status_canvas = tk.Canvas(frame, width=20, height=20)
                status_canvas.grid(row=2, column=0, pady=5)
                plane["status_canvas"] = status_canvas
            
            # Mettre à jour l'indicateur de sélection pour le premier avion
            self.update_selection_indicator(self.current_end_phase_index, self.end_phase_planes)
            
            # Frame pour l'avion actuel
            self.current_end_frame = ttk.LabelFrame(main_frame, text="Gestion des menaces", padding="10")
            self.current_end_frame.grid(row=1, column=0, columnspan=3, pady=20, sticky="ew")
            
            # Frame pour les choix de menace
            threat_frame = ttk.Frame(self.current_end_frame)
            threat_frame.grid(row=1, column=0, columnspan=4, pady=10)
            
            # Boutons pour les choix de menace
            threat_choices = [
                ("aucune", "Aucune menace"),
                ("dos", "Menacé de dos"),
                ("flanc", "Menacé de flanc")
            ]
            
            for i, (value, text) in enumerate(threat_choices):
                ttk.Button(threat_frame, text=text, 
                          command=lambda v=value: self.set_threat_choice(v)).grid(row=0, column=i, padx=5)
            
            # Boutons de navigation
            nav_frame = ttk.Frame(self.current_end_frame)
            nav_frame.grid(row=2, column=0, columnspan=4, pady=10)
            
            ttk.Button(nav_frame, text="← Précédent", 
                      command=self.previous_end_phase_plane).grid(row=0, column=0, padx=10)
            ttk.Button(nav_frame, text="Suivant →", 
                      command=self.next_end_phase_plane).grid(row=0, column=1, padx=10)
            
            # Boutons de validation
            validation_frame = ttk.Frame(main_frame)
            validation_frame.grid(row=2, column=0, columnspan=3, pady=20)
            
            ttk.Button(validation_frame, text="Plus aucune menace ce tour", 
                      command=self.mark_all_no_threat).grid(row=0, column=0, padx=10)
            
            self.validate_end_button = ttk.Button(validation_frame, text="Terminer le tour", 
                                                command=self.finish_round)
            self.validate_end_button.grid(row=0, column=1, padx=10)
            self.validate_end_button.config(state='disabled')
            
            # Mettre à jour l'affichage de l'avion actuel
            self.update_end_phase_display()

        def update_end_phase_display(self):
            """Met à jour l'affichage de l'avion actuel dans la phase de fin"""
            # Mettre à jour l'indicateur de sélection
            self.update_selection_indicator(self.current_end_phase_index, self.end_phase_planes)
            
            # Nettoyer le frame
            for widget in self.current_end_frame.winfo_children():
                if isinstance(widget, ttk.Label):
                    widget.destroy()
            
            plane = self.end_phase_planes[self.current_end_phase_index]
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Afficher les informations de l'avion
            text = f"Joueur {plane['joueur']} - Avion {plane['numero']} ({plane_data['nom']})\n"
            text += f"Pilot Skill: {plane_data['pilot_skill']}\n"
            text += f"Menace actuelle: {plane_data.get('menace', 'aucune')}"
            
            ttk.Label(self.current_end_frame, text=text).grid(row=0, column=0, columnspan=4, padx=10, pady=10)

        def previous_end_phase_plane(self):
            """Passe à l'avion précédent dans la phase de fin"""
            if self.current_end_phase_index > 0:
                # Réinitialiser le carré de l'avion actuel
                current_plane = self.end_phase_planes[self.current_end_phase_index]
                if "status_canvas" in current_plane:
                    canvas = current_plane["status_canvas"]
                    canvas.delete("all")
                    canvas.create_rectangle(2, 2, 18, 18, fill="white", outline="gray", width=2)
                
                self.current_end_phase_index -= 1
                self.update_end_phase_display()
                self.update_selection_indicator(self.current_end_phase_index, self.end_phase_planes)

        def next_end_phase_plane(self):
            """Passe à l'avion suivant dans la phase de fin"""
            if self.current_end_phase_index < len(self.end_phase_planes) - 1:
                # Réinitialiser le carré de l'avion actuel
                current_plane = self.end_phase_planes[self.current_end_phase_index]
                if "status_canvas" in current_plane:
                    canvas = current_plane["status_canvas"]
                    canvas.delete("all")
                    canvas.create_rectangle(2, 2, 18, 18, fill="white", outline="gray", width=2)
                
                self.current_end_phase_index += 1
                self.update_end_phase_display()
                self.update_selection_indicator(self.current_end_phase_index, self.end_phase_planes)

        def set_threat_choice(self, threat):
            """Définit la menace pour l'avion actuel"""
            plane = self.end_phase_planes[self.current_end_phase_index]
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Mettre à jour la menace dans les données
            plane_data["menace"] = threat
            
            # Log de la menace
            threat_text = "aucune menace" if threat == "aucune" else f"menacé de {threat}"
            logging.info(f'[MENACE] {plane_data["nom"]} (J{plane["joueur"]}-A{plane["numero"]}) : {threat_text}')
            
            # Mettre à jour l'indicateur visuel
            self.update_selection_indicator(self.current_end_phase_index, self.end_phase_planes, "green")
            
            # Mettre à jour l'affichage
            self.update_end_phase_display()
            
            # Vérifier si tous les avions ont été traités
            self.check_all_threats()

        def check_all_threats(self):
            """Vérifie si tous les avions ont été traités pour les menaces"""
            all_processed = True
            for plane in self.end_phase_planes:
                plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
                if "menace" not in plane_data:
                    all_processed = False
                    break
            
            self.validate_end_button.config(state='normal' if all_processed else 'disabled')

        def mark_all_no_threat(self):
            """Marque tous les avions restants comme n'ayant aucune menace"""
            for plane in self.end_phase_planes:
                plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
                if "menace" not in plane_data:
                    plane_data["menace"] = "aucune"
            
            self.update_end_phase_display()
            self.validate_end_button.config(state='normal')

        def finish_round(self):
            """Termine le tour et sauvegarde les modifications"""
            try:
                # Log de fin de round
                logging.info(f'[ROUND] Fin du round {self.round_number}')
                
                # Résumé des avions restants
                for joueur, data in config_data["In_game"]["joueurs"].items():
                    for num_avion, avion in data["avions"].items():
                        if avion["statut"] != "détruit":
                            logging.info(f'[ETAT] {avion["nom"]} (J{joueur}-A{num_avion}) : PV={avion["PV_actuel"]}, Energie={avion["energie"]}, Critiques={", ".join(avion["critiques_subis"]) if avion["critiques_subis"] else "aucun"}')
                
                # Sauvegarder l'état du jeu
                config_data["In_game"]["current_round"] = self.round_number
                config_data["In_game"]["current_phase"] = "initiative"  # On commence toujours par l'initiative au prochain round
                
                # Sauvegarder les modifications dans config.json
                with open('config.json', 'w', encoding='utf-8') as f:
                    json.dump(config_data, f, indent=4, ensure_ascii=False)
                logging.info(f'[SAUVEGARDE] Round {self.round_number} terminé et sauvegardé')
                
                # Incrémenter le numéro du round
                self.round_number += 1
                logging.info(f'[ROUND] Début du round {self.round_number}')
                
                # Fermer la fenêtre
                self.window.destroy()
                
                # Commencer un nouveau round
                self.start_game()
            except Exception as e:
                logging.error(f'Erreur lors de la finalisation du round: {str(e)}')
                messagebox.showerror("Erreur", "Impossible de sauvegarder les modifications")

        def destroy_plane_directly(self):
            """Ajoute une action de destruction pour l'avion actuel"""
            plane = self.attack_planes[self.current_attack_index]
            plane_id = f"{plane['joueur']}-{plane['numero']}"
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Vérifier si l'avion est marqué comme "Pas d'attaque"
            if any("Pas d'attaque" in action for action in self.plane_actions.get(plane_id, [])):
                messagebox.showerror("Erreur", "Cet avion est marqué comme 'Pas d'attaque'. Réinitialisez d'abord.")
                return
            
            # Ajouter l'action
            self.plane_actions[plane_id].append("Destruction directe")
            
            # Mettre à jour l'affichage
            self.update_current_attack_display()
            
            # Vérifier si tous les avions ont une action
            self.check_all_actions()

        def remove_critique(self, critique_name):
            """Enlève un critique spécifique de l'avion actuel"""
            plane = self.round_planes[self.current_plane_index]
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Retirer le critique de la liste
            if critique_name in plane_data["critiques_subis"]:
                plane_data["critiques_subis"].remove(critique_name)
                logging.info(f'[CRITIQUE RETIRÉ] {plane_data["nom"]} (J{plane["joueur"]}-A{plane["numero"]}) : le critique "{critique_name}" a été retiré')
                
                # Mettre à jour l'affichage
                self.update_current_plane_display()
                self.update_removable_critiques_frame()

        def update_removable_critiques_frame(self):
            """Met à jour la frame des critiques qui peuvent être enlevés"""
            # Supprimer les anciens boutons
            if hasattr(self, 'critiques_frame'):
                for widget in self.critiques_frame.winfo_children():
                    widget.destroy()
            
            plane = self.round_planes[self.current_plane_index]
            plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
            
            # Vérifier les critiques qui peuvent être enlevés
            removable_critiques = []
            for critique in plane_data["critiques_subis"]:
                effet = config_data["Critique"].get(critique, {})
                if isinstance(effet, dict) and effet.get("Init") == "Premier":
                    removable_critiques.append(critique)
            
            # S'il y a des critiques à enlever, créer les boutons
            if removable_critiques:
                for critique in removable_critiques:
                    ttk.Button(self.critiques_frame, 
                             text=f"Enlever {critique}",
                             command=lambda c=critique: self.remove_critique(c)).pack(pady=2)

        def apply_movement_damage(self):
            """Applique des dégâts à l'avion pendant la phase de mouvement"""
            try:
                damage = int(self.movement_damage_entry.get())
                if damage <= 0:
                    messagebox.showerror("Erreur", "Les dégâts doivent être positifs")
                    return
                
                plane = self.round_planes[self.current_plane_index]
                plane_data = config_data["In_game"]["joueurs"][plane["joueur"]]["avions"][plane["numero"]]
                
                # Calculer les nouveaux PV
                current_pv = int(plane_data["PV_actuel"])
                new_pv = max(0, current_pv - damage)
                plane_data["PV_actuel"] = str(new_pv)
                
                # Log des dégâts
                logging.info(f'[DEGATS] {plane_data["nom"]} (J{plane["joueur"]}-A{plane["numero"]}) : subit {damage} dégâts (PV: {current_pv} -> {new_pv})')
                
                # Si les PV tombent à 0, marquer comme détruit
                if new_pv == 0:
                    plane_data["statut"] = "détruit"
                    logging.info(f'[DESTRUCTION] {plane_data["nom"]} (J{plane["joueur"]}-A{plane["numero"]}) est détruit!')
                    messagebox.showinfo("Destruction", f"L'avion {plane_data['nom']} a été détruit!")
                
                # Vider le champ de dégâts
                self.movement_damage_entry.delete(0, tk.END)
                
                # Mettre à jour l'affichage
                self.update_current_plane_display()
                
            except ValueError:
                messagebox.showerror("Erreur", "Veuillez entrer un nombre valide")


if __name__ == "__main__":
    try:
        root = tk.Tk()
        app = MainApplication(root)
        logging.info('Application démarrée avec succès')
        root.mainloop()
    except Exception as e:
        logging.critical(f'Erreur critique lors de l\'exécution: {str(e)}')
        raise 
