# Rulfo

Description of the app TBD

## App creation and configs

This App is a heavy user of Firebase and GoogleAI. As a first step you need to create a firebase project.
From firebase get these public variables from your project configuration.

- GOOGLE_PROJECT_ID
- PUBLIC_API_KEY
- PUBLIC_APP_ID

After that generate a private key from *Service Accounts* section

From Google Apps:

- GOOGLE_GENAI_API_KEY
- GOOGLE_PRIVATE_KEY_ID
- GOOGLE_CLIENT_EMAIL
- GOOGLE_CLIENT_ID
- GOOGLE_AUTH_URI
- GOOGLE_AUTH_PROVIDER_X509_CERT_URL
- GOOGLE_CLIENT_X509_CERT_URL


In addition, you should add your final domain to Firebase Authentication authorized domains.

## Deploy

This application has backend and front SPA in the same repository. 
To deploy the app I recommend deploy the backend with any serverless provider and frontend with a static page hosting.

In this example I use Digital Ocean as cloud provider for both services wit App Platform.

App plataform generate a App Spec configuration detecting the project files. This generated App Spec was WRONG.
Uste this instead and *voilà!*;

==IMPORTANT: Replace env vars described upside and AI_SERVICE_URL with your final backend URL. Change repo URL if you make a fork==

```yml
alerts:
- rule: DEPLOYMENT_FAILED
- rule: DOMAIN_FAILED
  envs:
- key: GOOGLE_PROJECT_ID
  scope: RUN_AND_BUILD_TIME
  value: wiki-50fe5
  features:
- buildpack-stack=ubuntu-22
  ingress:
  rules:
    - component:
      name: backend
      match:
      authority:
      exact: ""
      path:
      prefix: /api
    - component:
      name: front
      match:
      authority:
      exact: ""
      path:
      prefix: /
      name: rulfo
      region: nyc
      services:
- environment_slug: node-js
  envs:
    - key: GOOGLE_GENAI_API_KEY
      scope: RUN_AND_BUILD_TIME
      value: googleGenAiApiKey
    - key: GOOGLE_PRIVATE_KEY_ID
      scope: RUN_AND_BUILD_TIME
      value: googlePrivateKeyId
    - key: GOOGLE_PRIVATE_KEY
      scope: RUN_AND_BUILD_TIME
      value: '-----BEGIN PRIVATE KEY-----googlePrivateKey-----\n'
    - key: GOOGLE_CLIENT_EMAIL
      scope: RUN_AND_BUILD_TIME
      value: firebase-adminsdk-fbsvc@wiki-50fe5.iam.gserviceaccount.com
    - key: GOOGLE_CLIENT_ID
      scope: RUN_AND_BUILD_TIME
      value: googleClientId
    - key: GOOGLE_AUTH_URI
      scope: RUN_AND_BUILD_TIME
      value: https://accounts.google.com/o/oauth2/auth
    - key: GOOGLE_AUTH_PROVIDER_X509_CERT_URL
      scope: RUN_AND_BUILD_TIME
      value: https://www.googleapis.com/oauth2/v1/certs
    - key: GOOGLE_CLIENT_X509_CERT_URL
      scope: RUN_AND_BUILD_TIME
      value: https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40wiki-50fe5.iam.gserviceaccount.com
      gitlab:
      branch: main
      deploy_on_push: true
      repo: promani/mermaid
      http_port: 8080
      instance_count: 1
      instance_size_slug: apps-s-1vcpu-0.5gb
      name: backend
      run_command: npm start
      source_dir: /
      static_sites:
- build_command: |-
  INPUT_FILE="js/render.js"
  OUTPUT_FILE="js/render.js.processed"

  sed -e "s|__PUBLIC_API_KEY__|${PUBLIC_API_KEY}|g" \
  -e "s|__PUBLIC_AUTH_DOMAIN__|${PUBLIC_AUTH_DOMAIN}|g" \
  -e "s|__PUBLIC_STORAGE_BUCKET__|${PUBLIC_STORAGE_BUCKET}|g" \
  -e "s|__PUBLIC_APP_ID__|${PUBLIC_APP_ID}|g" \
  -e "s|__AI_SERVICE_URL__|${AI_SERVICE_URL}|g" \
  -e "s|__GOOGLE_PROJECT_ID__|${GOOGLE_PROJECT_ID}|g" \
  "$INPUT_FILE" > "$OUTPUT_FILE" && mv "$OUTPUT_FILE" "$INPUT_FILE"

  mkdir -p dist && cp index.html dist/ && cp -r assets/ dist/ && cp -r css/ dist/ && cp -r css/ dist/
  environment_slug: html
  envs:
    - key: PUBLIC_API_KEY
      scope: BUILD_TIME
      value: firebasePublicApiKey
    - key: PUBLIC_APP_ID
      scope: BUILD_TIME
      value: firebaseAppId
    - key: AI_SERVICE_URL
      scope: BUILD_TIME
      value: https://example.com/api
      gitlab:
      branch: main
      deploy_on_push: true
      repo: promani/mermaid
      name: front
      source_dir: /
```
