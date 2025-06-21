# API Productos - Microservicio Multi-tenant para Inkafarma

Este microservicio se enfoca exclusivamente en la gestión de productos (medicinas) con soporte multi-tenant usando AWS Lambda, DynamoDB y autenticación JWT.

## Características

- ✅ Multi-tenancy (soporte para múltiples inquilinos)
- ✅ Serverless con AWS Lambda
- ✅ Protegido con autenticación JWT
- ✅ CRUD completo de productos
- ✅ Paginación en listado
- ✅ DynamoDB Streams habilitado
- ✅ CORS habilitado
- ✅ Despliegue automatizado con Serverless Framework
- ✅ Gestión de URLs de imágenes externas

## Estructura de Productos

Cada producto contiene:

- **código**: Código único generado automáticamente (MED-xxxxx-xxxxx)
- **nombre**: Nombre del medicamento
- **precio**: Precio en soles (número decimal)
- **descripcion**: Descripción del producto
- **imagen_url**: URL externa de la imagen (gestionada por otro microservicio)
- **tenant_id**: Identificador del inquilino
- **fecha_creacion**: Timestamp de creación
- **fecha_modificacion**: Timestamp de última modificación
- **activo**: Estado del producto

## Endpoints

### 1. Listar Productos (Paginado)

- **URL**: `GET /productos/listar`
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `limit` (opcional): Número de productos por página (default: 20)
  - `lastKey` (opcional): Clave para paginación (base64 encoded)
- **Respuesta**:

```json
{
  "productos": [...],
  "count": 20,
  "nextKey": "base64_encoded_key",
  "hasMore": true
}
```

### 2. Crear Producto

- **URL**: `POST /productos/crear`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:

```json
{
  "nombre": "Paracetamol 500mg",
  "precio": 12.5,
  "descripcion": "Analgésico y antipirético para dolores leves a moderados",
  "imagen_url": "https://api-imagenes.mi-servicio.com/imagen/123456"
}
```

### 3. Buscar Producto por Código

- **URL**: `GET /productos/buscar/{codigo}`
- **Headers**: `Authorization: Bearer <token>`
- **Respuesta**:

```json
{
  "producto": {
    "tenant_id": "inkafarma",
    "codigo": "MED-ABC123-DEF456",
    "nombre": "Paracetamol 500mg",
    "precio": 12.5,
    "descripcion": "Analgésico y antipirético",
    "imagen_url": "https://api-imagenes.mi-servicio.com/imagen/123456",
    "fecha_creacion": "2025-06-14T10:30:00Z",
    "fecha_modificacion": "2025-06-14T10:30:00Z",
    "activo": true
  }
}
```

### 4. Modificar Producto

- **URL**: `PUT /productos/modificar/{codigo}`
- **Headers**: `Authorization: Bearer <token>`
- **Body** (todos los campos son opcionales):

```json
{
  "nombre": "Paracetamol 500mg - Nuevo",
  "precio": 15.0,
  "descripcion": "Nueva descripción",
  "imagen_url": "https://api-imagenes.mi-servicio.com/imagen/789012",
  "activo": true
}
```

### 5. Eliminar Producto

- **URL**: `DELETE /productos/eliminar/{codigo}`
- **Headers**: `Authorization: Bearer <token>`
- **Respuesta**:

```json
{
  "message": "Producto eliminado exitosamente",
  "producto_eliminado": { ... }
}
```

## Instalación y Despliegue

### Prerrequisitos

- Node.js 18+
- AWS CLI configurado con credenciales válidas
- Serverless Framework (`npm install -g serverless`)
- Token JWT válido del microservicio de usuarios
- Permisos AWS para crear recursos (DynamoDB, Lambda, IAM)

### Variables de Entorno

El sistema utiliza las siguientes variables de entorno (configuradas automáticamente):

- `TABLE_NAME`: `{stage}-t_productos` (auto-generado por stage)
- `JWT_SECRET`: `mi-super-secreto-jwt-2025`

### Comandos de Despliegue

```bash
# Instalar dependencias
npm install

# Desplegar a desarrollo
npm run deploy-dev

# Desplegar a testing
npm run deploy-test

# Desplegar a producción
npm run deploy-prod

# Eliminar despliegue
npm run remove-dev
npm run remove-test
npm run remove-prod

# Ver información del despliegue
npm run info

# Ver logs en tiempo real
npm run logs-crear
npm run logs-listar
npm run logs-buscar
npm run logs-modificar
npm run logs-eliminar
```

## Estructura del Proyecto

```
api-productos/
├── productos.js         # Funciones Lambda principales
├── serverless.yml       # Configuración Serverless Framework
├── package.json         # Configuración del proyecto y scripts
└── README.md           # Documentación del proyecto
```

## Tabla DynamoDB

**Nombre**: `{stage}-t_productos`

**Schema**:

- **Partition Key**: `tenant_id` (String)
- **Sort Key**: `codigo` (String)
- **Streams**: Habilitado con NEW_AND_OLD_IMAGES
- **Billing**: PAY_PER_REQUEST

**Campos**:

- `tenant_id`: Identificador del inquilino (extraído del JWT)
- `codigo`: Código único del producto (auto-generado formato MED-xxxxx-xxxxx)
- `nombre`: Nombre del producto (requerido, trimmed)
- `precio`: Precio en soles (Number, mayor a 0)
- `descripcion`: Descripción del producto (requerido, trimmed)
- `imagen_url`: URL externa de imagen (opcional)
- `fecha_creacion`: Timestamp ISO de creación
- `fecha_modificacion`: Timestamp ISO de última modificación
- `activo`: Estado del producto (Boolean, default: true)

## Gestión de Imágenes

Este microservicio **NO** gestiona imágenes directamente. Las imágenes son manejadas por un microservicio separado dedicado exclusivamente a la gestión de archivos.

### Integración con Microservicio de Imágenes

- El campo `imagen_url` almacena la URL devuelta por el microservicio de imágenes
- Al crear/modificar un producto, se puede proporcionar una URL externa
- No hay validación del contenido de la imagen en este microservicio
- La gestión de archivos (subida, eliminación, redimensionamiento) es responsabilidad del otro microservicio

## Seguridad

### Autenticación JWT

- Todos los endpoints requieren token JWT válido en header `Authorization: Bearer <token>`
- Soporte para header `authorization` (minúscula) como fallback
- Validación de expiración y firma del token
- Extracción automática de `tenant_id` desde payload JWT

### Multi-tenancy

- Aislamiento completo de datos por `tenant_id`
- Todas las operaciones filtradas automáticamente por tenant

### Validaciones de Datos

- Campos requeridos validados en creación
- Tipos de datos validados (números, strings, booleans)
- Sanitización de strings (trim)
- Validación de precios (mayor a 0)
- Validación de códigos de producto en paths

### CORS y Headers

- CORS habilitado para todos los orígenes (`*`)
- Headers permitidos: `Content-Type`, `X-Amz-Date`, `Authorization`, `X-Api-Key`, `X-Amz-Security-Token`
- Métodos permitidos: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`

## Códigos de Estado HTTP

- **200**: Operación exitosa (GET, PUT, DELETE)
- **201**: Producto creado exitosamente (POST)
- **400**: Datos inválidos, faltantes o formato incorrecto
- **401**: Token inválido, expirado o faltante
- **404**: Producto no encontrado
- **500**: Error interno del servidor

## Generación de Códigos

Los códigos de producto se generan automáticamente con el formato:

```
MED-{timestamp_base36}-{random_6_chars}
```

Ejemplo: `MED-LKJ4H2K1-A7B9C2`

## Manejo de Errores

### Errores Comunes

- **Token JWT**: Validación de formato, expiración y firma
- **JSON malformado**: Validación de sintaxis en request body
- **Campos faltantes**: Validación de campos requeridos
- **Tipos de datos**: Validación de números, strings, etc.

### Logs

- Todos los errores se registran en CloudWatch Logs
- Información de debug disponible para troubleshooting
- Separación de logs por función Lambda

## Dependencias

### Producción

- `@aws-sdk/client-dynamodb@^3.511.0`: Cliente DynamoDB SDK v3
- `@aws-sdk/lib-dynamodb@^3.511.0`: Document Client para DynamoDB
- `jsonwebtoken@^9.0.2`: Validación de tokens JWT

### Desarrollo

- `serverless@^3.38.0`: Framework de despliegue serverless
- `serverless-esbuild@^1.55.1`: Plugin para empaquetado eficiente

## Configuración AWS

### IAM Role

- **Role ARN**: `arn:aws:iam::409362080365:role/LabRole`
- **Permisos requeridos**:
  - DynamoDB: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`
  - CloudWatch: `CreateLogGroup`, `CreateLogStream`, `PutLogEvents`

### Recursos Creados Automáticamente

- Tabla DynamoDB con streams habilitado
- Funciones Lambda con configuración de memoria y timeout
- API Gateway con endpoints y CORS
- CloudWatch Log Groups para cada función

## Arquitectura de Microservicios

Este microservicio es parte de una arquitectura de microservicios donde:

- **API Productos**: Gestión exclusiva de datos de productos (este servicio)
- **API Imágenes**: Gestión exclusiva de archivos e imágenes (servicio separado)
- **API Usuarios**: Autenticación y gestión de usuarios (servicio separado)

Esta separación permite:

- Escalabilidad independiente
- Responsabilidades bien definidas
- Menor acoplamiento entre servicios
- Facilidad de mantenimiento
