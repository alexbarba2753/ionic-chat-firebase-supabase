# Chat Multiplataforma Híbrido (Ionic + Capacitor + Firebase + Supabase)

Aplicación de mensajería instantánea multiplataforma orientada a **Web** y **Android (APK nativo)**, construida con **Ionic Framework 9**, **Angular Standalone**, **Capacitor 8**, **Firebase** y **Supabase** integrados de manera simultánea.

---

## Integrantes del Equipo

| Nombre Completo | Correo Institucional | Módulos / Responsabilidades |
| :--- | :--- | :--- |
| _[Nombre del Integrante 1]_ | _[correo1@epn.edu.ec]_ | _[Ej. Autenticación, Perfil y Configuración Cloud]_ |
| _[Nombre del Integrante 2]_ | _[correo2@epn.edu.ec]_ | _[Ej. Salas, Directorio y Presencia]_ |
| _[Nombre del Integrante 3]_ | _[correo3@epn.edu.ec]_ | _[Ej. Mensajería en Tiempo Real, Citas y Reacciones]_ |
| _[Nombre del Integrante 4]_ | _[correo4@epn.edu.ec]_ | _[Ej. Multimedia, Audio, Ubicación GPS y Encuestas]_ |

---

## Cómo Trabajan Juntos Firebase y Supabase

La arquitectura divide las responsabilidades según las fortalezas de cada plataforma, manteniendo una única identidad de usuario transversal:

### 1. Responsabilidades de Firebase
- **Firebase Authentication**: Provee el registro e inicio de sesión (Correo/Contraseña, Google Sign-In y recuperación de contraseña) y genera el `uid` canónico que identifica al usuario en toda la plataforma.
- **Cloud Firestore**: Motor NoSQL de baja latencia con sincronización offline nativa encargado del flujo en tiempo real (`onSnapshot`) de mensajes (`rooms/{roomId}/messages`), indicadores de escritura (`typing_states`), presencia en vivo (`user_presence`), reacciones con emojis y confirmaciones de lectura (`readBy`).
- **Firebase Hosting**: Publicación del bundle Web (`www/`) mediante CDN global con HTTPS y reescritura de rutas SPA.

### 2. Responsabilidades de Supabase
- **Supabase PostgreSQL**: Motor relacional con integridad referencial e índices para el directorio de usuarios (`profiles`), catálogo de salas (`chat_rooms`), membresías y roles RBAC (`room_members`), registro de archivos compartidos (`shared_media`), historial de ubicaciones GPS (`shared_locations`) y encuestas con restricción relacional de voto único (`polls`, `poll_votes` con `UNIQUE (poll_id, voter_uid)`).
- **Supabase Storage**: Almacenamiento de objetos organizado en los buckets `avatars` (fotos de perfil) y `chat-media` (imágenes de cámara/galería, documentos adjuntos y notas de voz).
- **Puente de Seguridad RLS**: `SupabaseClientService` inyecta automáticamente el encabezado `x-firebase-uid` en cada petición HTTP hacia Supabase. La función SQL `public.requesting_user_uid()` valida ese identificador dentro de las políticas Row-Level Security (RLS) activas en todas las tablas y en `storage.objects`.

```text
[Ionic + Angular + Capacitor]
       │
       ├──► Firebase Auth ──────► Emite `uid` canónico de sesión
       │
       ├──► Cloud Firestore ────► Mensajes en vivo, typing_states, user_presence, readBy, reacciones
       │
       └──► Supabase (con header `x-firebase-uid` -> `requesting_user_uid()`)
              ├── PostgreSQL ───► profiles, chat_rooms, room_members, shared_media, shared_locations, polls, poll_votes
              └── Storage ──────► Buckets `avatars` y `chat-media`
```

---

## Funcionalidades Implementadas (16 en Total)

| Código | Funcionalidad | Detalle Técnico |
| :--- | :--- | :--- |
| **F01** | Autenticación multi-proveedor y gestión de sesión | Registro e inicio de sesión con Email/Password, Google Sign-In, recuperación de contraseña por correo y guardias de ruta (`authGuard` / `guestGuard`). |
| **F02** | Gestión y edición de perfil de usuario | Edición de nombre visible, `@username` único, teléfono, estado rápido y biografía en `profiles` con carga de avatar al bucket `avatars`. |
| **F03** | Presencia en vivo y última conexión | Estado Online/Offline y marca `last_seen` sincronizados entre Firestore `user_presence` y Supabase `profiles`. |
| **F04** | Directorio global y búsqueda de usuarios | Búsqueda reactiva (`ILIKE`) por nombre, usuario o correo para iniciar chats directos 1:1 sin duplicar salas existentes. |
| **F05** | Creación y administración de salas de chat | Soporte para chats directos (`direct`), grupos privados (`group`) y canales públicos (`channel`) con roles `admin`, `moderator` y `member`, silenciamiento y gestión de participantes. |
| **F06** | Mensajería instantánea en tiempo real | Envío, recepción en vivo con `onSnapshot`, edición de mensajes propios (`isEdited`) y borrado lógico (`isDeleted`). |
| **F07** | Indicadores de escritura en tiempo real | Estado `"escribiendo..."` por sala en `typing_states` con limpieza automática por inactividad. |
| **F08** | Confirmaciones de lectura y no leídos | Registro de lectura en `readBy` (doble check en burbujas) y reinicio/conteo de `unread_count` en `room_members`. |
| **F09** | Respuestas citadas y reenvío de mensajes | Respuesta contextual vinculada al mensaje original (`replyTo`) con salto al mensaje citado y reenvío hacia otras salas. |
| **F10** | Reacciones con emojis en tiempo real | Barra rápida de emojis por mensaje sincronizada en Firestore `reactions`. |
| **F11** | Envío de imágenes (Cámara y Galería) | Captura nativa mediante `@capacitor/camera` o selector Web con almacenamiento en `chat-media` y visor ampliado. |
| **F12** | Envío de documentos y galería multimedia | Carga y descarga de archivos (PDF, Office, TXT, ZIP) más modal de galería filtrable por imágenes, documentos y audios. |
| **F13** | Notas de voz integradas | Grabación con `MediaRecorder` y temporizador en el composer, subida al bucket `chat-media` y reproductor embebido en el hilo. |
| **F14** | Compartir ubicación GPS real | Lectura de coordenadas de alta precisión con `@capacitor/geolocation`, etiqueta personalizada, registro en `shared_locations`, vista previa de mapa y apertura en Google Maps / OpenStreetMap. |
| **F15** | Encuestas interactivas en el chat | Creación de encuestas de 2 a 6 opciones, votación con unicidad por usuario (`poll_votes`), porcentajes en vivo y cierre de votación. |
| **F16** | Mensajes fijados y buscador interno | Fijado de mensajes en cabecera (`chat_rooms.pinned_message_id`) con salto directo y barra buscadora interna por texto dentro de cada sala. |

---

## Estructura del Proyecto

```text
ionic-chat-firebase-supabase/
├── android/                        # Proyecto nativo Capacitor Android y AndroidManifest.xml
├── scripts/
│   └── set-env.mjs                 # Generador de environment.ts y environment.prod.ts desde .env
├── src/
│   ├── environments/
│   │   └── environment.example.ts  # Plantilla sin credenciales para entornos Angular
│   └── app/
│       ├── app.component.ts        # Registro global de iconos Ionicons
│       ├── app.routes.ts           # Enrutamiento lazy principal con guardias
│       ├── core/                   # Contratos, clientes Firebase/Supabase y guardias
│       └── features/
│           ├── auth/               # Login, registro y recuperación de contraseña
│           ├── profile/            # Edición de perfil, avatar y diagnóstico dual
│           ├── rooms/              # Lista de salas, directorio, creación y ajustes
│           ├── chat/               # Hilo en tiempo real, burbujas, typing y reenvío
│           ├── media/              # Cámara, archivos, notas de voz y galería
│           ├── location/           # Selector GPS y tarjeta interactiva de ubicación
│           └── polls/              # Encuestas, mensaje fijado y buscador interno
├── capacitor.config.ts
├── firebase.json
├── firestore.rules
├── .env.example
└── package.json
```

---

## Instalación y Configuración

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/alexbarba2753/ionic-chat-firebase-supabase.git
cd ionic-chat-firebase-supabase
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz a partir de `.env.example` (nunca se sube al repositorio):

```bash
cp .env.example .env
```

Completa las variables con tus proyectos propios de Firebase y Supabase:

```env
FIREBASE_API_KEY=<tu_firebase_api_key>
FIREBASE_AUTH_DOMAIN=<tu_proyecto>.firebaseapp.com
FIREBASE_PROJECT_ID=<tu_firebase_project_id>
FIREBASE_STORAGE_BUCKET=<tu_proyecto>.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=<tu_sender_id>
FIREBASE_APP_ID=<tu_firebase_app_id>
FIREBASE_MEASUREMENT_ID=<tu_measurement_id>

SUPABASE_URL=https://<tu_supabase_ref>.supabase.co
SUPABASE_ANON_KEY=<tu_supabase_publishable_or_anon_key>
```

Genera los archivos `src/environments/environment.ts` y `src/environments/environment.prod.ts` (también se regeneran automáticamente antes de `npm start` y `npm run build`):

```bash
npm run config:env
```

---

## Ejecución y Despliegue

### Web (Desarrollo y Producción)

```bash
# Servidor local de desarrollo
npm start

# Compilación Web de producción (genera la carpeta www/)
npm run build

# Verificación de calidad y pruebas unitarias
npm run lint
npm run test:unit

# Despliegue Web en Firebase Hosting (requiere `npx firebase-tools@latest login` y `use <PROJECT_ID>`)
npm run deploy:web
```

### Android (Capacitor y Generación de APK)

El proyecto Android ya cuenta con los permisos declarados en `android/app/src/main/AndroidManifest.xml` (`INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_AUDIO`, `ACCESS_COARSE_LOCATION` y `ACCESS_FINE_LOCATION`).

```bash
# Compilar la web y sincronizar plugins y assets con Android
npm run cap:sync

# Abrir el proyecto en Android Studio para generar el APK (Build > Build APK(s))
npx cap open android
```

Si cuentas con Android SDK configurado en terminal, también puedes compilar el APK de depuración directamente con Gradle:

```bash
cd android
./gradlew assembleDebug
```

El APK generado quedará en `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## Capturas de Pantalla

> Coloca las capturas finales dentro de `docs/screenshots/` manteniendo los nombres indicados.

### Autenticación y Perfil
| Login y Registro | Edición de Perfil y Diagnóstico Dual |
| :---: | :---: |
| ![Pantalla de Login](docs/screenshots/01-login.png) | ![Pantalla de Perfil](docs/screenshots/02-perfil.png) |

### Salas, Directorio y Mensajería en Tiempo Real
| Lista de Salas y Presencia | Directorio de Usuarios | Chat en Tiempo Real |
| :---: | :---: | :---: |
| ![Lista de Salas](docs/screenshots/03-salas.png) | ![Directorio de Usuarios](docs/screenshots/04-directorio.png) | ![Sala de Chat](docs/screenshots/05-chat-tiempo-real.png) |

### Multimedia, Ubicación GPS y Encuestas
| Imágenes, Archivos y Notas de Voz | Ubicación GPS | Encuestas, Fijado y Búsqueda |
| :---: | :---: | :---: |
| ![Multimedia y Audio](docs/screenshots/06-multimedia.png) | ![Ubicación GPS](docs/screenshots/07-ubicacion.png) | ![Encuestas y Fijado](docs/screenshots/08-encuestas-fijado.png) |
