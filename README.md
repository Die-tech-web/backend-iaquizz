# Aka Care - IA Quiz Sante (NestJS)

Backend modulaire NestJS pour quiz sante, structure ICD-11 et mapping HL7 FHIR.

## 1) Initialisation PostgreSQL (etapes)

1. Ouvrir PostgreSQL:
```bash
sudo -u postgres psql
```
2. Definir le mot de passe `postgres` a `ebeno` si besoin:
```sql
ALTER USER postgres WITH PASSWORD 'ebeno';
```
3. Initialiser la base:
```bash
psql -U postgres -h 127.0.0.1 -f scripts/init-db.sql
```
4. Copier la config:
```bash
cp .env.example .env
```

## 2) Lancer le projet

```bash
npm install
npm run start:dev
```

Liens locaux directs:
```bash
API: http://localhost:3000
http://localhost:3000/docs
http://localhost:3000/docs-json
```

Serveurs Swagger (menu `Servers`):
```bash
SWAGGER_LOCAL_SERVER_URL=http://localhost:3000
SWAGGER_PRODUCTION_SERVER_URL=https://your-render-service.onrender.com
```
Tu peux mettre l'URL Render finale dans `SWAGGER_PRODUCTION_SERVER_URL` pour tester directement la prod depuis Swagger.

## 3) Architecture modulaire

- `icd`: catalogue maladies/themes + correlations (ICD-11)
- `quiz`: quiz, questions, tentatives, soumission et scoring de base
- `patient`: profil patient, comorbidites, UUID
- `analysis`: correlation graph + recommandations patient
- `fhir`: mapping `Questionnaire` et `QuestionnaireResponse`

## 4) Filtres supportes

`GET /quizzes`

Parametres:
- `mainDisease` (ex: `CHRONIC_KIDNEY_DISEASE`)
- `correlatedDiseases` (CSV)
- `themes` (CSV)
- `level` (`BEGINNER|INTERMEDIATE|ADVANCED`)
- `patientProfile` (`STANDARD|CHRONIC|DIALYSIS|COMORBID|AT_RISK`)
- `patientId` (UUID)

## 5) Endpoints REST principaux

- `POST /auth/register-patient`
- `POST /auth/login`
- `GET /icd/topics`
- `GET /icd/correlations/:mainTopic`
- `GET /icd/external/search?q=...`
- `POST /patients`
- `GET /patients`
- `GET /patients/:id`
- `GET /quizzes`
- `GET /quizzes/:id`
- `POST /quizzes/submit`
- `GET /analysis/correlations/:mainTopic`
- `GET /analysis/recommendations/patient/:patientId`
- `GET /analysis/recommendations-v2/patient/:patientId`
- `GET /fhir/questionnaire/:quizId`
- `GET /fhir/questionnaire-response/:attemptId`
- `POST /fhir/publish/questionnaire/:quizId`
- `POST /fhir/publish/questionnaire-response/:attemptId`

## 6) Test via Swagger (login patient)

1. Ouvrir `http://localhost:3000/docs`
2. Executer `POST /auth/register-patient` (ou `POST /auth/login`)
3. Copier `accessToken`
4. Cliquer `Authorize` et coller `Bearer <accessToken>`
5. Tester les endpoints proteges (`/patients`, `/quizzes/submit`, `/analysis/recommendations/...`)

## 6) Themes et maladies prechargees

- Paludisme
- Tuberculose
- Diabete
- Hypertension
- Drepanocytose
- Insuffisance renale chronique
- Dialyse
- Vaccination
- Nutrition

## 7) Correlations cles prechargees (autour IRC)

- IRC -> Diabete
- IRC -> Hypertension
- IRC -> Dialyse
- IRC -> Nutrition
- IRC -> Vaccination

Chaque correlation a:
- `type`
- `priority`
- `strength`
- `rationale`

## 8) Mapping standards

- Quiz -> FHIR `Questionnaire`
- Reponses patient -> FHIR `QuestionnaireResponse`
- Maladies/themes -> mapping ICD-11 (code + label)

## 9) Evolution IA prete

Le design separe deja:
- filtrage
- correlations
- scoring
- interoperability FHIR
- classification ICD-11

Tu peux ensuite ajouter:
- moteur de recommendation intelligent
- scoring adaptatif par profil patient
- integration API ICD-11 officielle
- integration serveur FHIR externe

## 10) Configuration ICD-11 reelle (WHO API)

1. Creer un compte ICD API:
- `https://icd.who.int/icdapi`
- puis `Register`

2. Recuperer `client_id` et `client_secret`:
- se connecter au portail
- ouvrir `View API access key`

3. Configurer `.env`:
```bash
WHO_ICD_CLIENT_ID=ton_client_id
WHO_ICD_CLIENT_SECRET=ton_client_secret
WHO_ICD_TOKEN_URL=https://icdaccessmanagement.who.int/connect/token
WHO_ICD_BASE_URL=https://id.who.int/icd/release/11/2025-01/mms
```

4. Relancer l API:
```bash
npm run start:dev
```

5. Tester dans Swagger:
- `GET /icd/external/search`
- query params:
  - `q=chronic kidney disease`
  - `lang=en`
  - `limit=10`

## 11) Configuration FHIR reelle (serveur externe)

Pour tests rapides tu peux utiliser le serveur public HAPI R4:
```bash
FHIR_SERVER_BASE_URL=http://hapi.fhir.org/baseR4
FHIR_SERVER_AUTH_TOKEN=
```

Puis:
1. Creer/login patient dans `/auth/...`
2. `Authorize` avec le JWT
3. Recuperer un `quizId` via `GET /quizzes`
4. Publier le questionnaire:
   - `POST /fhir/publish/questionnaire/{quizId}`
5. Soumettre un quiz pour obtenir un `attemptId`:
   - `POST /quizzes/submit`
6. Publier la reponse:
   - `POST /fhir/publish/questionnaire-response/{attemptId}`

## 12) Deploiement backend sur Render (Docker + PostgreSQL)

### Fichiers Docker

Le projet contient maintenant:
- `Dockerfile` (build multi-stage NestJS)
- `.dockerignore` (contexte Docker propre)

### Test Docker en local (optionnel mais recommande)

Depuis `ia-quiz/`:
```bash
docker build -t ia-quiz-backend .
docker run --rm -p 3000:3000 --env-file .env ia-quiz-backend
```

Swagger:
```bash
http://localhost:3000/docs
```

### Etapes Render: base de donnees + API

1. Push le code sur GitHub.
2. Dans Render, creer une PostgreSQL database:
- Name: `ia-quiz-db` (ou autre)
- Region: meme region que le backend
- Plan: Free/Starter selon ton besoin
3. Creer un nouveau `Web Service`:
- Source: ton repo GitHub
- Root Directory: `ia-quiz`
- Runtime: `Docker`
- Branch: `main` (ou ta branche)
4. Dans `Environment`, ajouter:
- `NODE_ENV=production`
- `PORT=10000`
- `HOST=0.0.0.0`
- `DB_SYNC=false`
- `DB_LOGGING=false`
- `JWT_SECRET=<secret-fort>`
- `JWT_EXPIRES_IN=24h`
- `SWAGGER_LOCAL_SERVER_URL=http://localhost:3000`
- `SWAGGER_PRODUCTION_SERVER_URL=https://<ton-service>.onrender.com`
- `DATABASE_URL=<Internal Database URL Render>`
- `DB_SSL=true`
- `DB_SSL_REJECT_UNAUTHORIZED=false`
5. Health Check Path:
- `/docs-json`
6. Deploy le service.

### Quelle URL DB utiliser sur Render

- Preferer `Internal Database URL` (meilleur reseau interne Render).
- Render injecte aussi souvent `DATABASE_URL` automatiquement si lie, sinon copie-colle l'URL manuellement.

### Initialisation de la base

Deux options:
- Option A (rapide): garder `DB_SYNC=true` temporairement au premier lancement, puis remettre `false`.
- Option B (propre): utiliser des migrations TypeORM.

Pour cette petite app, Option A est acceptable pour debuter.

### Checklist de validation apres deploy

1. Ouvrir `https://<ton-service>.onrender.com/docs`
2. Dans `Servers`, choisir `Production (Render)`
3. Tester:
- `POST /auth/register-patient`
- `POST /auth/login`
- `GET /quizzes`
4. Verifier que les requetes repondent sans erreur 5xx.

### Ensuite (front)

Une fois backend valide:
- mettre `VITE_API_BASE_URL=https://<ton-service>.onrender.com` dans le front
- redeployer le front sur Vercel
