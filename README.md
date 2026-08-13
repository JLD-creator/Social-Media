# DevSpace — foro para developers

Mini red social de nicho para desarrolladores: publica posts técnicos, comenta en hilos anidados, da like, sigue a otros usuarios y modera contenido reportado.

![Node](https://img.shields.io/badge/Node.js-22-green) ![Express](https://img.shields.io/badge/Express-4-black) ![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-blue)

## Características

- **Autenticación real** con JWT + bcrypt.
- **Feed paginado** con filtro por etiqueta (`javascript`, `python`, `backend`...) y buscador de texto.
- **Comentarios anidados** (respuestas a respuestas, sin límite de profundidad) mediante `parent_comment_id` autorreferenciado.
- **Likes con constraint único**: la tabla `likes` tiene clave primaria compuesta `(user_id, post_id)`, así que un usuario no puede dar like dos veces al mismo post a nivel de base de datos, no solo de lógica de aplicación.
- **Sistema de follows** entre usuarios, con contadores de seguidores/seguidos en el perfil.
- **Roles y moderación**: los moderadores pueden eliminar cualquier post/comentario y tienen un panel para revisar reportes de la comunidad.
- **Permisos reales**: un usuario normal solo puede borrar su propio contenido; un moderador puede borrar cualquiera.

## Stack

- **Backend**: Node.js + Express
- **Base de datos**: SQLite (`better-sqlite3`)
- **Auth**: JWT + bcrypt
- **Frontend**: HTML/CSS/JS vanilla (SPA con vistas alternadas por JS, sin framework ni build step)

## Cómo levantarlo en local

```bash
npm install
npm start
```

Abre `http://localhost:3001`.

### Probar la moderación

Para tener un usuario moderador de ejemplo:

```bash
node seed.js
```

Esto crea (o promueve) el usuario `mod@devspace.com` / `moderador123` con rol `mod`. Con esa cuenta verás el botón "mod" en la barra superior, que da acceso al panel de reportes.

## Estructura del proyecto

```
mini-red-social/
├── server.js          # API REST completa
├── db.js              # Esquema SQLite (users, posts, comments, likes, follows, reports)
├── seed.js            # Crea un usuario moderador de ejemplo
├── public/
│   ├── index.html      # SPA: feed, detalle de post, perfil, panel de moderación
│   ├── css/style.css
│   └── js/app.js
└── package.json
```

## Decisiones técnicas

- **Comentarios anidados con una sola tabla autorreferenciada** (`parent_comment_id`) en vez de tablas separadas por nivel: es el patrón estándar para árboles en SQL relacional, y el frontend reconstruye el árbol completo (`buildCommentTree`) a partir de la lista plana que devuelve la API.
- **Likes como tabla puente con PK compuesta**: en vez de un contador en `posts`, cada like es una fila. Esto permite consultar "¿ha dado like este usuario?" de forma directa y evita condiciones de carrera al hacer toggle.
- **Roles en vez de un sistema de permisos más granular**: para el alcance de este proyecto, `user`/`mod` es suficiente y fácil de entender; se podría extender a un sistema de permisos por acción si creciera.
- **SQLite**: mismo razonamiento que en el resto de mis proyectos — cero fricción para que cualquiera lo levante en local.

## Posibles mejoras futuras

- Feed personalizado según a quién sigues
- Notificaciones (nuevo comentario, nuevo seguidor)
- Editar posts/comentarios (ahora mismo solo se pueden borrar)
- Markdown en el contenido de los posts, con resaltado de sintaxis para bloques de código
- Migrar a PostgreSQL para producción
