
1. Pour extraire la structure des tables et des colonnes
Cette requête liste toutes les tables, leurs colonnes, les types de données, et les valeurs par défaut.

SQL
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'valorisation' -- Remplacez par 'public' si vous avez d'autres tables classiques
ORDER BY table_name, ordinal_position;


2. Pour extraire les relations (Clés étrangères)
Idéal pour que je comprenne comment vos tables sont liées entre elles (indispensable pour l'architecture).

SQL
SELECT
    tc.table_name AS table_source, 
    kcu.column_name AS colonne_source, 
    ccu.table_name AS table_cible,
    ccu.column_name AS colonne_cible 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'valorisation';


3. Pour extraire vos règles de sécurité (RLS & Policies)
Cette requête va extraire toutes les "Policies" (qui a le droit de SELECT, INSERT, UPDATE, DELETE) et les conditions exactes que vous avez configurées dans Supabase.

SQL
SELECT 
    tablename as table, 
    policyname as nom_regle, 
    cmd as action, 
    roles, 
    qual as condition_lecture, 
    with_check as condition_ecriture
FROM pg_policies
WHERE schemaname = 'valorisation';


4. Pour vérifier quelles tables ont le RLS d'activé
Pour être sûr qu'aucune table n'est laissée sans protection.

SQL
SELECT 
    relname as table_name, 
    relrowsecurity as rls_est_active
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'valorisation' AND c.relkind = 'r';