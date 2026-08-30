extraire la structure des tables et des colonnes
| table_name         | column_name             | data_type                | is_nullable | column_default               |
| ------------------ | ----------------------- | ------------------------ | ----------- | ---------------------------- |
| act_ip_logs        | id                      | uuid                     | NO          | gen_random_uuid()            |
| act_ip_logs        | created_at              | timestamp with time zone | NO          | timezone('utc'::text, now()) |
| act_ip_logs        | user_id                 | uuid                     | NO          | null                         |
| act_ip_logs        | patient_initiales       | text                     | NO          | null                         |
| act_ip_logs        | patient_age             | integer                  | YES         | null                         |
| act_ip_logs        | patient_sexe            | text                     | YES         | null                         |
| act_ip_logs        | medecin_nom             | text                     | YES         | null                         |
| act_ip_logs        | medicament_en_cause     | text                     | NO          | null                         |
| act_ip_logs        | probleme_identifie      | text                     | NO          | null                         |
| act_ip_logs        | type_intervention       | text                     | NO          | null                         |
| act_ip_logs        | avis_prescripteur       | text                     | YES         | null                         |
| act_ip_logs        | statut_ip               | text                     | YES         | null                         |
| act_ip_logs        | commentaires            | text                     | YES         | null                         |
| act_ip_logs        | medecin_id              | uuid                     | YES         | null                         |
| act_ip_logs        | mode_transmission       | text                     | YES         | null                         |
| act_ip_logs        | devenir_intervention    | text                     | YES         | null                         |
| advice_events      | id                      | uuid                     | NO          | gen_random_uuid()            |
| advice_events      | user_id                 | uuid                     | NO          | null                         |
| advice_events      | type                    | text                     | NO          | null                         |
| advice_events      | status                  | text                     | NO          | null                         |
| advice_events      | data                    | jsonb                    | YES         | null                         |
| advice_events      | created_at              | timestamp with time zone | NO          | now()                        |
| agenda_events      | id                      | uuid                     | NO          | gen_random_uuid()            |
| agenda_events      | type                    | text                     | YES         | null                         |
| agenda_events      | date_evenement          | timestamp with time zone | NO          | null                         |
| agenda_events      | details                 | jsonb                    | NO          | null                         |
| agenda_events      | created_at              | timestamp with time zone | YES         | now()                        |
| call_logs          | id                      | uuid                     | NO          | gen_random_uuid()            |
| call_logs          | created_at              | timestamp with time zone | NO          | timezone('utc'::text, now()) |
| call_logs          | user_id                 | uuid                     | NO          | null                         |
| call_logs          | type                    | text                     | NO          | null                         |
| call_logs          | contact_id              | uuid                     | YES         | null                         |
| call_logs          | contact_nom             | text                     | YES         | null                         |
| call_logs          | numero                  | text                     | NO          | null                         |
| call_logs          | duree_secondes          | integer                  | YES         | 0                            |
| call_logs          | motif                   | text                     | YES         | null                         |
| call_logs          | statut_traitement       | text                     | YES         | 'cloture'::text              |
| call_logs          | notes_appel             | text                     | YES         | null                         |
| directory_contacts | id                      | uuid                     | NO          | gen_random_uuid()            |
| directory_contacts | type                    | text                     | NO          | null                         |
| directory_contacts | nom                     | text                     | NO          | null                         |
| directory_contacts | prenom                  | text                     | YES         | null                         |
| directory_contacts | telephone               | text                     | YES         | null                         |
| directory_contacts | telephone_prive         | text                     | YES         | null                         |
| directory_contacts | infos_contact           | text                     | YES         | null                         |
| directory_contacts | mail_prive              | text                     | YES         | null                         |
| directory_contacts | mail_mssante            | text                     | YES         | null                         |
| directory_contacts | mode_commande           | text                     | YES         | null                         |
| directory_contacts | remise_commande         | text                     | YES         | null                         |
| directory_contacts | franco                  | text                     | YES         | null                         |
| directory_contacts | nom_service_client      | text                     | YES         | null                         |
| directory_contacts | created_at              | timestamp with time zone | YES         | now()                        |
| directory_contacts | specialite              | text                     | YES         | null                         |
| directory_contacts | switch_rupture          | text                     | YES         | null                         |
| directory_contacts | commentaires            | text                     | YES         | null                         |
| directory_contacts | site_web                | text                     | YES         | null                         |
| directory_contacts | tel_service_client      | text                     | YES         | null                         |
| directory_contacts | email_service_client    | text                     | YES         | null                         |
| quality_events     | id                      | uuid                     | NO          | gen_random_uuid()            |
| quality_events     | user_id                 | uuid                     | NO          | null                         |
| quality_events     | type                    | text                     | NO          | null                         |
| quality_events     | data                    | jsonb                    | YES         | null                         |
| quality_events     | created_at              | timestamp with time zone | NO          | now()                        |
| task_assignments   | id                      | uuid                     | NO          | gen_random_uuid()            |
| task_assignments   | task_id                 | uuid                     | YES         | null                         |
| task_assignments   | user_id                 | uuid                     | YES         | null                         |
| task_assignments   | statut                  | text                     | YES         | 'en_cours'::text             |
| task_assignments   | completed_at            | timestamp with time zone | YES         | null                         |
| task_assignments   | completion_time_seconds | integer                  | YES         | null                         |
| task_assignments   | commentaire             | text                     | YES         | null                         |
| taskbar_logs       | id                      | uuid                     | NO          | gen_random_uuid()            |
| taskbar_logs       | user_id                 | uuid                     | NO          | null                         |
| taskbar_logs       | action                  | text                     | NO          | null                         |
| taskbar_logs       | created_at              | timestamp with time zone | NO          | now()                        |
| tasks              | id                      | uuid                     | NO          | gen_random_uuid()            |
| tasks              | titre                   | text                     | NO          | null                         |
| tasks              | description             | text                     | YES         | null                         |
| tasks              | created_by              | uuid                     | YES         | null                         |
| tasks              | created_at              | timestamp with time zone | YES         | now()                        |

extraire les relations (Clés étrangères)
| table_source     | colonne_source | table_cible        | colonne_cible |
| ---------------- | -------------- | ------------------ | ------------- |
| task_assignments | task_id        | tasks              | id            |
| task_assignments | user_id        | profiles           | id            |
| call_logs        | contact_id     | directory_contacts | id            |
| act_ip_logs      | medecin_id     | directory_contacts | id            |
| tasks            | created_by     | profiles           | id            |


extraire rls et policies
| table              | nom_regle                               | action | roles           | condition_lecture                                                                                                      | condition_ecriture                    |
| ------------------ | --------------------------------------- | ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| act_ip_logs        | ActIP Insert Access                     | INSERT | {public}        | null                                                                                                                   | (auth.role() = 'authenticated'::text) |
| act_ip_logs        | ActIP Delete Access                     | DELETE | {public}        | (auth.role() = 'authenticated'::text)                                                                                  | null                                  |
| taskbar_logs       | insert own taskbar_logs                 | INSERT | {authenticated} | null                                                                                                                   | (auth.uid() = user_id)                |
| taskbar_logs       | select own taskbar_logs                 | SELECT | {authenticated} | (auth.uid() = user_id)                                                                                                 | null                                  |
| quality_events     | insert own quality_events               | INSERT | {authenticated} | null                                                                                                                   | (auth.uid() = user_id)                |
| quality_events     | select own quality_events               | SELECT | {authenticated} | (auth.uid() = user_id)                                                                                                 | null                                  |
| advice_events      | insert own advice_events                | INSERT | {authenticated} | null                                                                                                                   | (auth.uid() = user_id)                |
| advice_events      | select own advice_events                | SELECT | {authenticated} | (auth.uid() = user_id)                                                                                                 | null                                  |
| taskbar_logs       | portail admin view all taskbar_logs     | SELECT | {authenticated} | (EXISTS ( SELECT 1
   FROM portail.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))             | null                                  |
| quality_events     | portail admin view all quality_events   | SELECT | {authenticated} | (EXISTS ( SELECT 1
   FROM portail.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))             | null                                  |
| advice_events      | portail admin view all advice_events    | SELECT | {authenticated} | (EXISTS ( SELECT 1
   FROM portail.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))             | null                                  |
| directory_contacts | Allow authenticated access to directory | ALL    | {authenticated} | true                                                                                                                   | true                                  |
| call_logs          | Insertion de ses propres appels         | INSERT | {public}        | null                                                                                                                   | (auth.uid() = user_id)                |
| call_logs          | Lecture de ses propres appels           | SELECT | {public}        | (auth.uid() = user_id)                                                                                                 | null                                  |
| call_logs          | Admins can update call logs             | UPDATE | {public}        | (EXISTS ( SELECT 1
   FROM portail.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))) | null                                  |
| act_ip_logs        | Insertion de ses IP                     | INSERT | {public}        | null                                                                                                                   | (auth.uid() = user_id)                |
| act_ip_logs        | Lecture de ses IP                       | SELECT | {public}        | (auth.uid() = user_id)                                                                                                 | null                                  |
| tasks              | Tasks Access                            | ALL    | {public}        | (auth.role() = 'authenticated'::text)                                                                                  | null                                  |
| task_assignments   | Assignments Access                      | ALL    | {public}        | (auth.role() = 'authenticated'::text)                                                                                  | null                                  |
| agenda_events      | Agenda Access                           | ALL    | {public}        | (auth.role() = 'authenticated'::text)                                                                                  | null                                  |
| act_ip_logs        | ActIP Update Access                     | UPDATE | {public}        | (auth.role() = 'authenticated'::text)                                                                                  | null                                  |
| tasks              | Lecture de toutes les tâches            | SELECT | {public}        | (auth.role() = 'authenticated'::text)                                                                                  | null                                  |
| tasks              | Création de tâches                      | INSERT | {public}        | null                                                                                                                   | (auth.uid() = created_by)             |
| tasks              | Modification par le créateur            | UPDATE | {public}        | (auth.uid() = created_by)                                                                                              | null                                  |
| task_assignments   | Lecture des assignations                | SELECT | {public}        | (auth.role() = 'authenticated'::text)                                                                                  | null                                  |
| task_assignments   | Création des assignations               | INSERT | {public}        | null                                                                                                                   | (auth.role() = 'authenticated'::text) |
| task_assignments   | Validation par l'utilisateur assigné    | UPDATE | {public}        | (auth.uid() = user_id)                                                                                                 | null                                  |