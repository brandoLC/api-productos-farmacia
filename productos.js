import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";

// Clientes AWS
const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const tableName = process.env.TABLE_NAME;
const jwtSecret = process.env.JWT_SECRET;

// Categorías predefinidas para productos farmacéuticos y parafarmacéuticos
const CATEGORIAS_DISPONIBLES = {
  // === MEDICAMENTOS ===
  Analgésicos: ["Antiinflamatorios", "Paracetamol", "Aspirinas", "Opioides"],
  Antibióticos: ["Penicilinas", "Cefalosporinas", "Macrólidos", "Quinolonas"],
  "Vitaminas y Minerales": [
    "Multivitamínicos",
    "Vitamina C",
    "Vitamina D",
    "Vitamina B",
    "Calcio",
    "Hierro",
    "Magnesio",
  ],
  Digestivos: [
    "Antiácidos",
    "Laxantes",
    "Antidiarreicos",
    "Probióticos",
    "Enzimas Digestivas",
  ],
  Respiratorios: [
    "Jarabes",
    "Descongestionantes",
    "Broncodilatadores",
    "Antihistamínicos",
  ],
  Cardiovasculares: [
    "Antihipertensivos",
    "Diuréticos",
    "Anticoagulantes",
    "Estatinas",
  ],

  // === CUIDADO PERSONAL ===
  "Higiene Personal": [
    "Jabones",
    "Champús",
    "Acondicionadores",
    "Desodorantes",
    "Gel de Baño",
  ],
  "Cuidado Bucal": [
    "Pasta Dental",
    "Enjuague Bucal",
    "Hilo Dental",
    "Cepillos de Dientes",
  ],
  "Protección Solar": [
    "Bloqueadores",
    "After Sun",
    "Bronceadores",
    "Protector Labial",
  ],
  "Cuidado de la Piel": [
    "Cremas Hidratantes",
    "Lociones",
    "Tratamientos Anti-edad",
    "Limpiadores Faciales",
  ],
  "Cuidado Capilar": [
    "Tratamientos",
    "Tintes",
    "Mascarillas",
    "Aceites Capilares",
  ],

  // === BEBÉ Y MATERNIDAD ===
  "Alimentación Infantil": [
    "Leches de Fórmula",
    "Papillas",
    "Cereales",
    "Complementos Nutricionales",
  ],
  "Cuidado del Bebé": [
    "Pañales",
    "Toallitas",
    "Cremas",
    "Champús Bebé",
    "Talcos",
  ],
  Maternidad: [
    "Vitaminas Prenatales",
    "Cremas Anti-estrías",
    "Suplementos Lactancia",
  ],

  // === NUTRICIÓN Y BIENESTAR ===
  "Suplementos Deportivos": [
    "Proteínas",
    "Pre-entreno",
    "Post-entreno",
    "Aminoácidos",
    "Creatina",
  ],
  "Productos Naturales": [
    "Hierbas Medicinales",
    "Aceites Esenciales",
    "Suplementos Herbales",
  ],
  "Control de Peso": [
    "Quemadores de Grasa",
    "Bloqueadores",
    "Sustitutos de Comida",
  ],

  // === ADULTO MAYOR ===
  "Tercera Edad": [
    "Suplementos Óseos",
    "Memoria y Concentración",
    "Articulaciones",
    "Energía",
  ],

  // === PRODUCTOS MÉDICOS ===
  "Equipos Médicos": [
    "Tensiómetros",
    "Glucómetros",
    "Termómetros",
    "Nebulizadores",
  ],
  "Primeros Auxilios": [
    "Vendas",
    "Gasas",
    "Alcohol",
    "Curitas",
    "Antisépticos",
  ],

  // === SEXUALIDAD ===
  "Salud Sexual": [
    "Preservativos",
    "Lubricantes",
    "Pruebas de Embarazo",
    "Anticonceptivos",
  ],

  // === HOGAR ===
  "Limpieza y Desinfección": [
    "Desinfectantes",
    "Alcohol en Gel",
    "Mascarillas",
    "Guantes",
  ],
};

// Función helper para respuestas consistentes
const lambdaResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
    body: JSON.stringify(body),
  };
};

// Función para validar token JWT
const validarToken = (event) => {
  try {
    let token = null;

    // Buscar token en headers Authorization
    if (event.headers && event.headers.Authorization) {
      const authHeader = event.headers.Authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    // Buscar token en headers authorization (minúscula)
    if (!token && event.headers && event.headers.authorization) {
      const authHeader = event.headers.authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return { valid: false, error: "Token requerido" };
    }

    const payload = jwt.verify(token, jwtSecret);
    return { valid: true, usuario: payload };
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return { valid: false, error: "Token expirado" };
    } else if (error.name === "JsonWebTokenError") {
      return { valid: false, error: "Token inválido" };
    }
    return { valid: false, error: "Error validando token" };
  }
};

// Función para generar código único de producto
const generarCodigoProducto = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `MED-${timestamp}-${random}`.toUpperCase();
};

// Listar productos con paginación
export async function listarProductos(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 20;
    let lastEvaluatedKey = null;

    if (queryParams.lastKey) {
      try {
        lastEvaluatedKey = JSON.parse(
          Buffer.from(queryParams.lastKey, "base64").toString()
        );
      } catch (e) {
        return lambdaResponse(400, { error: "lastKey inválido" });
      }
    }

    const params = {
      TableName: tableName,
      KeyConditionExpression: "tenant_id = :tenant_id",
      ExpressionAttributeValues: {
        ":tenant_id": tenantId,
      },
      Limit: limit,
      ScanIndexForward: false, // Ordenar por fecha de creación descendente
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.send(new QueryCommand(params));

    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
        "base64"
      );
    }

    return lambdaResponse(200, {
      productos: result.Items,
      count: result.Items.length,
      nextKey: nextKey,
      hasMore: !!result.LastEvaluatedKey,
    });
  } catch (error) {
    console.error("Error listando productos:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Crear producto
export async function crearProducto(event, context) {
  console.log("EVENTO RECIBIDO:", JSON.stringify(event));
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;

    let body;
    if (typeof event.body === "string") {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return lambdaResponse(400, { error: "JSON inválido" });
      }
    } else {
      body = event.body;
    }

    // Validar campos requeridos
    const requiredFields = [
      "nombre",
      "precio",
      "descripcion",
      "categoria",
      "laboratorio",
      "presentacion",
    ];
    for (const field of requiredFields) {
      if (!body[field]) {
        return lambdaResponse(400, { error: `Campo requerido: ${field}` });
      }
    }

    // Validar precio
    const precio = parseFloat(body.precio);
    if (isNaN(precio) || precio <= 0) {
      return lambdaResponse(400, {
        error: "Precio debe ser un número mayor a 0",
      });
    }

    // Validar stock_disponible
    const stock = parseInt(body.stock_disponible) || 0;
    if (stock < 0) {
      return lambdaResponse(400, {
        error: "Stock disponible debe ser un número mayor o igual a 0",
      });
    }

    // Validar categoría y subcategoría
    const categoriaValidation = validarCategoria(
      body.categoria,
      body.subcategoria
    );
    if (!categoriaValidation.valid) {
      return lambdaResponse(400, { error: categoriaValidation.error });
    }

    // Validar categoría y subcategoría
    if (body.categoria) {
      const categoriaValidation = validarCategoria(
        body.categoria,
        body.subcategoria
      );
      if (!categoriaValidation.valid) {
        return lambdaResponse(400, { error: categoriaValidation.error });
      }
    }

    const codigo = generarCodigoProducto();
    const fechaCreacion = new Date().toISOString();

    const producto = {
      tenant_id: tenantId,
      codigo: codigo,
      nombre: body.nombre.trim(),
      precio: precio,
      descripcion: body.descripcion.trim(),
      categoria: body.categoria.trim(),
      subcategoria: body.subcategoria ? body.subcategoria.trim() : null,
      stock_disponible: stock,
      requiere_receta: body.requiere_receta || false,
      laboratorio: body.laboratorio.trim(),
      presentacion: body.presentacion.trim(),
      imagen_url: body.imagen_url || "", // URL externa del microservicio de imágenes
      fecha_creacion: fechaCreacion,
      fecha_modificacion: fechaCreacion,
      activo: true,
    };

    const params = {
      TableName: tableName,
      Item: producto,
    };

    await dynamodb.send(new PutCommand(params));

    return lambdaResponse(201, {
      message: "Producto creado exitosamente",
      producto: producto,
    });
  } catch (error) {
    console.error("Error creando producto:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Buscar producto por código - VERSIÓN CORREGIDA
export async function buscarProducto(event, context) {
  console.log("Evento completo:", JSON.stringify(event, null, 2)); // Debug

  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;

    // Múltiples formas de obtener el código
    let codigo = null;

    // Opción 1: Desde path (tu estructura actual)
    if (event.path && event.path.codigo) {
      codigo = event.path.codigo;
    }

    // Opción 2: Desde pathParameters (estructura estándar de API Gateway)
    if (!codigo && event.pathParameters && event.pathParameters.codigo) {
      codigo = event.pathParameters.codigo;
    }

    // Opción 3: Desde queryStringParameters (fallback)
    if (
      !codigo &&
      event.queryStringParameters &&
      event.queryStringParameters.codigo
    ) {
      codigo = event.queryStringParameters.codigo;
    }

    // Opción 4: Desde resource path parsing (backup)
    if (!codigo && event.resource) {
      const matches = event.resource.match(/\/productos\/buscar\/([^\/]+)/);
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    // Opción 5: Desde requestPath parsing (tu estructura actual)
    if (!codigo && event.requestPath) {
      const matches = event.requestPath.match(/\/productos\/buscar\/([^\/]+)/);
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    // Opción 6: Desde requestContext (otro fallback)
    if (!codigo && event.requestContext && event.requestContext.resourcePath) {
      const matches = event.requestContext.resourcePath.match(
        /\/productos\/buscar\/([^\/]+)/
      );
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    console.log("Código extraído:", codigo); // Debug

    if (!codigo) {
      console.log("PathParameters:", event.pathParameters);
      console.log("Path:", event.path);
      console.log("Resource:", event.resource);
      console.log("RequestPath:", event.requestPath);
      console.log("RequestContext:", event.requestContext);
      return lambdaResponse(400, {
        error: "Código de producto requerido",
        debug: {
          pathParameters: event.pathParameters,
          path: event.path,
          resource: event.resource,
          requestPath: event.requestPath,
        },
      });
    }

    const params = {
      TableName: tableName,
      Key: {
        tenant_id: tenantId,
        codigo: codigo,
      },
    };

    console.log("Parámetros DynamoDB:", JSON.stringify(params, null, 2)); // Debug

    const result = await dynamodb.send(new GetCommand(params));

    if (!result.Item) {
      return lambdaResponse(404, { error: "Producto no encontrado" });
    }

    return lambdaResponse(200, {
      producto: result.Item,
    });
  } catch (error) {
    console.error("Error buscando producto:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Modificar producto
export async function modificarProducto(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;

    // Múltiples formas de obtener el código
    let codigo = null;

    // Opción 1: Desde path
    if (event.path && event.path.codigo) {
      codigo = event.path.codigo;
    }

    // Opción 2: Desde pathParameters
    if (!codigo && event.pathParameters && event.pathParameters.codigo) {
      codigo = event.pathParameters.codigo;
    }

    // Opción 3: Desde queryStringParameters
    if (
      !codigo &&
      event.queryStringParameters &&
      event.queryStringParameters.codigo
    ) {
      codigo = event.queryStringParameters.codigo;
    }

    // Opción 4: Desde resource path parsing
    if (!codigo && event.resource) {
      const matches = event.resource.match(/\/productos\/([^\/]+)/);
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    // Opción 5: Desde requestPath parsing
    if (!codigo && event.requestPath) {
      const matches = event.requestPath.match(/\/productos\/([^\/]+)/);
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    // Opción 6: Desde requestContext
    if (!codigo && event.requestContext && event.requestContext.resourcePath) {
      const matches = event.requestContext.resourcePath.match(
        /\/productos\/([^\/]+)/
      );
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    if (!codigo) {
      console.log("PathParameters:", event.pathParameters);
      console.log("Path:", event.path);
      console.log("Resource:", event.resource);
      console.log("RequestPath:", event.requestPath);
      console.log("RequestContext:", event.requestContext);
      return lambdaResponse(400, {
        error: "Código de producto requerido",
        debug: {
          pathParameters: event.pathParameters,
          path: event.path,
          resource: event.resource,
          requestPath: event.requestPath,
        },
      });
    }

    let body;
    console.log("Tipo de event.body:", typeof event.body);
    console.log("Contenido de event.body:", event.body);

    try {
      if (typeof event.body === "string") {
        body = JSON.parse(event.body);
      } else if (typeof event.body === "object") {
        body = event.body;
      } else {
        console.error("Tipo de body no soportado:", typeof event.body);
        return lambdaResponse(400, {
          error: "Formato de body no soportado",
          debug: {
            bodyType: typeof event.body,
            bodyContent: event.body,
          },
        });
      }
    } catch (e) {
      console.error("Error parseando JSON:", e);
      return lambdaResponse(400, {
        error: "JSON inválido",
        debug: {
          error: e.message,
          bodyContent: event.body,
        },
      });
    }

    // Verificar que el producto existe
    const getParams = {
      TableName: tableName,
      Key: {
        tenant_id: tenantId,
        codigo: codigo,
      },
    };

    const existingProduct = await dynamodb.send(new GetCommand(getParams));
    if (!existingProduct.Item) {
      return lambdaResponse(404, { error: "Producto no encontrado" });
    }

    // Construir expresión de actualización
    let updateExpression = "SET fecha_modificacion = :fecha_modificacion";
    let expressionAttributeValues = {
      ":fecha_modificacion": new Date().toISOString(),
    };
    let expressionAttributeNames = {};

    // Campos que se pueden actualizar
    const updatableFields = [
      "nombre",
      "precio",
      "descripcion",
      "categoria",
      "subcategoria",
      "stock_disponible",
      "requiere_receta",
      "laboratorio",
      "presentacion",
      "imagen_url",
      "activo",
    ];

    for (const field of updatableFields) {
      if (body[field] !== undefined) {
        if (field === "precio") {
          const precio = parseFloat(body[field]);
          if (isNaN(precio) || precio <= 0) {
            return lambdaResponse(400, {
              error: "Precio debe ser un número mayor a 0",
            });
          }
          updateExpression += `, #${field} = :${field}`;
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = precio;
        } else if (field === "stock_disponible") {
          const stock = parseInt(body[field]);
          if (isNaN(stock) || stock < 0) {
            return lambdaResponse(400, {
              error: "Stock disponible debe ser un número mayor o igual a 0",
            });
          }
          updateExpression += `, #${field} = :${field}`;
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = stock;
        } else if (field === "categoria") {
          // Validar categoría y subcategoría si se proporcionan
          const categoriaValidation = validarCategoria(
            body[field],
            body.subcategoria
          );
          if (!categoriaValidation.valid) {
            return lambdaResponse(400, { error: categoriaValidation.error });
          }
          updateExpression += `, #${field} = :${field}`;
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = body[field].trim();
        } else if (field === "subcategoria") {
          // La subcategoría se valida junto con la categoría
          if (body[field]) {
            updateExpression += `, #${field} = :${field}`;
            expressionAttributeNames[`#${field}`] = field;
            expressionAttributeValues[`:${field}`] = body[field].trim();
          } else {
            // Si se envía null o "", se limpia la subcategoría
            updateExpression += `, #${field} = :${field}`;
            expressionAttributeNames[`#${field}`] = field;
            expressionAttributeValues[`:${field}`] = null;
          }
        } else if (
          field === "nombre" ||
          field === "descripcion" ||
          field === "laboratorio" ||
          field === "presentacion"
        ) {
          if (typeof body[field] !== "string" || !body[field].trim()) {
            return lambdaResponse(400, {
              error: `${field} no puede estar vacío`,
            });
          }
          updateExpression += `, #${field} = :${field}`;
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = body[field].trim();
        } else if (field === "requiere_receta") {
          updateExpression += `, #${field} = :${field}`;
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = Boolean(body[field]);
        } else {
          updateExpression += `, #${field} = :${field}`;
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = body[field];
        }
      }
    }

    const updateParams = {
      TableName: tableName,
      Key: {
        tenant_id: tenantId,
        codigo: codigo,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      updateParams.ExpressionAttributeNames = expressionAttributeNames;
    }

    const result = await dynamodb.send(new UpdateCommand(updateParams));

    return lambdaResponse(200, {
      message: "Producto modificado exitosamente",
      producto: result.Attributes,
    });
  } catch (error) {
    console.error("Error modificando producto:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Eliminar producto
export async function eliminarProducto(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;

    // Múltiples formas de obtener el código
    let codigo = null;

    // Opción 1: Desde path
    if (event.path && event.path.codigo) {
      codigo = event.path.codigo;
    }

    // Opción 2: Desde pathParameters
    if (!codigo && event.pathParameters && event.pathParameters.codigo) {
      codigo = event.pathParameters.codigo;
    }

    // Opción 3: Desde queryStringParameters
    if (
      !codigo &&
      event.queryStringParameters &&
      event.queryStringParameters.codigo
    ) {
      codigo = event.queryStringParameters.codigo;
    }

    // Opción 4: Desde resource path parsing
    if (!codigo && event.resource) {
      const matches = event.resource.match(/\/productos\/([^\/]+)/);
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    // Opción 5: Desde requestPath parsing
    if (!codigo && event.requestPath) {
      const matches = event.requestPath.match(/\/productos\/([^\/]+)/);
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    // Opción 6: Desde requestContext
    if (!codigo && event.requestContext && event.requestContext.resourcePath) {
      const matches = event.requestContext.resourcePath.match(
        /\/productos\/([^\/]+)/
      );
      if (matches && matches[1]) {
        codigo = matches[1];
      }
    }

    if (!codigo) {
      console.log("PathParameters:", event.pathParameters);
      console.log("Path:", event.path);
      console.log("Resource:", event.resource);
      console.log("RequestPath:", event.requestPath);
      console.log("RequestContext:", event.requestContext);
      return lambdaResponse(400, {
        error: "Código de producto requerido",
        debug: {
          pathParameters: event.pathParameters,
          path: event.path,
          resource: event.resource,
          requestPath: event.requestPath,
        },
      });
    }

    // Obtener producto antes de eliminar
    const getParams = {
      TableName: tableName,
      Key: {
        tenant_id: tenantId,
        codigo: codigo,
      },
    };

    const existingProduct = await dynamodb.send(new GetCommand(getParams));
    if (!existingProduct.Item) {
      return lambdaResponse(404, { error: "Producto no encontrado" });
    }

    const deleteParams = {
      TableName: tableName,
      Key: {
        tenant_id: tenantId,
        codigo: codigo,
      },
      ReturnValues: "ALL_OLD",
    };

    const result = await dynamodb.send(new DeleteCommand(deleteParams));

    return lambdaResponse(200, {
      message: "Producto eliminado exitosamente",
      producto_eliminado: result.Attributes,
    });
  } catch (error) {
    console.error("Error eliminando producto:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Función helper para validar categoría y subcategoría
const validarCategoria = (categoria, subcategoria) => {
  if (!CATEGORIAS_DISPONIBLES[categoria]) {
    return {
      valid: false,
      error: `Categoría '${categoria}' no válida. Categorías disponibles: ${Object.keys(
        CATEGORIAS_DISPONIBLES
      ).join(", ")}`,
    };
  }

  if (
    subcategoria &&
    !CATEGORIAS_DISPONIBLES[categoria].includes(subcategoria)
  ) {
    return {
      valid: false,
      error: `Subcategoría '${subcategoria}' no válida para '${categoria}'. Subcategorías disponibles: ${CATEGORIAS_DISPONIBLES[
        categoria
      ].join(", ")}`,
    };
  }

  return { valid: true };
};

// Obtener categorías disponibles
export async function obtenerCategorias(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    return lambdaResponse(200, {
      categorias: CATEGORIAS_DISPONIBLES,
      total_categorias: Object.keys(CATEGORIAS_DISPONIBLES).length,
    });
  } catch (error) {
    console.error("Error obteniendo categorías:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Filtrar productos con múltiples criterios
export async function filtrarProductos(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;
    const queryParams = event.queryStringParameters || {};

    // Parámetros de filtrado
    const categoria = queryParams.categoria;
    const subcategoria = queryParams.subcategoria;
    const laboratorio = queryParams.laboratorio;
    const requiere_receta = queryParams.requiere_receta;
    const precio_min = queryParams.precio_min
      ? parseFloat(queryParams.precio_min)
      : null;
    const precio_max = queryParams.precio_max
      ? parseFloat(queryParams.precio_max)
      : null;
    const search = queryParams.search; // Búsqueda por nombre o descripción

    // Parámetros de paginación
    const limit = parseInt(queryParams.limit) || 20;
    let lastEvaluatedKey = null;

    if (queryParams.lastKey) {
      try {
        lastEvaluatedKey = JSON.parse(
          Buffer.from(queryParams.lastKey, "base64").toString()
        );
      } catch (e) {
        return lambdaResponse(400, { error: "lastKey inválido" });
      }
    }

    // Construir parámetros de consulta
    const params = {
      TableName: tableName,
      KeyConditionExpression: "tenant_id = :tenant_id",
      ExpressionAttributeValues: {
        ":tenant_id": tenantId,
      },
      Limit: limit,
      ScanIndexForward: false,
    };

    // Construir filtros
    let filterExpressions = [];
    let expressionAttributeNames = {};

    if (categoria) {
      filterExpressions.push("#categoria = :categoria");
      expressionAttributeNames["#categoria"] = "categoria";
      params.ExpressionAttributeValues[":categoria"] = categoria;
    }

    if (subcategoria) {
      filterExpressions.push("subcategoria = :subcategoria");
      params.ExpressionAttributeValues[":subcategoria"] = subcategoria;
    }

    if (laboratorio) {
      filterExpressions.push("contains(laboratorio, :laboratorio)");
      params.ExpressionAttributeValues[":laboratorio"] = laboratorio;
    }

    if (requiere_receta !== undefined) {
      filterExpressions.push("requiere_receta = :requiere_receta");
      params.ExpressionAttributeValues[":requiere_receta"] =
        requiere_receta === "true";
    }

    if (precio_min !== null) {
      filterExpressions.push("precio >= :precio_min");
      params.ExpressionAttributeValues[":precio_min"] = precio_min;
    }

    if (precio_max !== null) {
      filterExpressions.push("precio <= :precio_max");
      params.ExpressionAttributeValues[":precio_max"] = precio_max;
    }

    if (search) {
      filterExpressions.push(
        "(contains(#nombre, :search) OR contains(descripcion, :search))"
      );
      expressionAttributeNames["#nombre"] = "nombre";
      params.ExpressionAttributeValues[":search"] = search;
    }

    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(" AND ");
    }

    if (Object.keys(expressionAttributeNames).length > 0) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.send(new QueryCommand(params));

    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
        "base64"
      );
    }

    return lambdaResponse(200, {
      productos: result.Items || [],
      count: result.Items?.length || 0,
      nextKey: nextKey,
      filtros_aplicados: {
        categoria,
        subcategoria,
        laboratorio,
        requiere_receta,
        precio_min,
        precio_max,
        search,
      },
    });
  } catch (error) {
    console.error("Error filtrando productos:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Obtener subcategorías de una categoría específica
export async function obtenerSubcategorias(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const categoria = event.pathParameters?.categoria;

    if (!categoria) {
      return lambdaResponse(400, { error: "Categoría requerida" });
    }

    if (!CATEGORIAS_DISPONIBLES[categoria]) {
      return lambdaResponse(404, {
        error: `Categoría '${categoria}' no encontrada`,
        categorias_disponibles: Object.keys(CATEGORIAS_DISPONIBLES),
      });
    }

    return lambdaResponse(200, {
      categoria: categoria,
      subcategorias: CATEGORIAS_DISPONIBLES[categoria],
      total: CATEGORIAS_DISPONIBLES[categoria].length,
    });
  } catch (error) {
    console.error("Error obteniendo subcategorías:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Obtener estadísticas para filtros del frontend
export async function obtenerEstadisticas(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;

    // Obtener todos los productos para generar estadísticas
    const params = {
      TableName: tableName,
      KeyConditionExpression: "tenant_id = :tenant_id",
      ExpressionAttributeValues: {
        ":tenant_id": tenantId,
      },
    };

    const result = await dynamodb.send(new QueryCommand(params));
    const productos = result.Items || [];

    // Calcular estadísticas
    const stats = {
      total_productos: productos.length,
      por_categoria: {},
      por_subcategoria: {},
      laboratorios: new Set(),
      rango_precios: {
        min: null,
        max: null,
        promedio: 0,
      },
      con_receta: 0,
      sin_receta: 0,
      stock_total: 0,
    };

    let suma_precios = 0;
    let precios = [];

    productos.forEach((producto) => {
      // Estadísticas por categoría
      if (producto.categoria) {
        stats.por_categoria[producto.categoria] =
          (stats.por_categoria[producto.categoria] || 0) + 1;
      }

      // Estadísticas por subcategoría
      if (producto.subcategoria) {
        stats.por_subcategoria[producto.subcategoria] =
          (stats.por_subcategoria[producto.subcategoria] || 0) + 1;
      }

      // Laboratorios únicos
      if (producto.laboratorio) {
        stats.laboratorios.add(producto.laboratorio);
      }

      // Estadísticas de precios
      if (producto.precio) {
        precios.push(producto.precio);
        suma_precios += producto.precio;
      }

      // Receta
      if (producto.requiere_receta) {
        stats.con_receta++;
      } else {
        stats.sin_receta++;
      }

      // Stock
      if (producto.stock_disponible) {
        stats.stock_total += producto.stock_disponible;
      }
    });

    // Calcular estadísticas de precios
    if (precios.length > 0) {
      stats.rango_precios.min = Math.min(...precios);
      stats.rango_precios.max = Math.max(...precios);
      stats.rango_precios.promedio = suma_precios / precios.length;
    }

    // Convertir Set a Array
    stats.laboratorios = Array.from(stats.laboratorios).sort();

    // Categorías disponibles (todas las posibles, no solo las que tienen productos)
    stats.categorias_disponibles = CATEGORIAS_DISPONIBLES;

    return lambdaResponse(200, stats);
  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}
