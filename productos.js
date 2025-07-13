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

    // Debug: log de queryParams recibidos
    console.log("=== FILTRAR PRODUCTOS DEBUG - INICIO ===");
    console.log("Query params RAW:", JSON.stringify(queryParams, null, 2));

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

    console.log("Parámetros extraídos:");
    console.log("- categoria:", categoria);
    console.log("- subcategoria:", subcategoria);
    console.log("- laboratorio:", laboratorio);
    console.log("- requiere_receta:", requiere_receta);
    console.log("- precio_min:", precio_min);
    console.log("- precio_max:", precio_max);
    console.log("- search:", search);

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
      console.log("✅ Filtro de categoría agregado:", categoria);
    }

    if (subcategoria) {
      filterExpressions.push("subcategoria = :subcategoria");
      params.ExpressionAttributeValues[":subcategoria"] = subcategoria;
      console.log("✅ Filtro de subcategoría agregado:", subcategoria);
    }

    if (laboratorio) {
      filterExpressions.push("contains(laboratorio, :laboratorio)");
      params.ExpressionAttributeValues[":laboratorio"] = laboratorio;
      console.log("✅ Filtro de laboratorio agregado:", laboratorio);
    }

    if (requiere_receta !== undefined) {
      filterExpressions.push("requiere_receta = :requiere_receta");
      params.ExpressionAttributeValues[":requiere_receta"] =
        requiere_receta === "true";
      console.log("✅ Filtro de receta agregado:", requiere_receta === "true");
    }

    if (precio_min !== null) {
      filterExpressions.push("precio >= :precio_min");
      params.ExpressionAttributeValues[":precio_min"] = precio_min;
      console.log("✅ Filtro de precio mínimo agregado:", precio_min);
    }

    if (precio_max !== null) {
      filterExpressions.push("precio <= :precio_max");
      params.ExpressionAttributeValues[":precio_max"] = precio_max;
      console.log("✅ Filtro de precio máximo agregado:", precio_max);
    }

    if (search) {
      filterExpressions.push(
        "(contains(#nombre, :search) OR contains(descripcion, :search))"
      );
      expressionAttributeNames["#nombre"] = "nombre";
      params.ExpressionAttributeValues[":search"] = search;
      console.log("✅ Filtro de búsqueda agregado:", search);
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

    // Debug: log de parámetros finales
    console.log("=== PARÁMETROS FINALES DYNAMODB ===");
    console.log("FilterExpressions count:", filterExpressions.length);
    console.log("FilterExpression final:", params.FilterExpression);
    console.log(
      "ExpressionAttributeValues:",
      JSON.stringify(params.ExpressionAttributeValues, null, 2)
    );
    console.log(
      "ExpressionAttributeNames:",
      JSON.stringify(params.ExpressionAttributeNames, null, 2)
    );
    console.log("Parámetros completos:", JSON.stringify(params, null, 2));

    const result = await dynamodb.send(new QueryCommand(params));

    // Debug: log de resultados
    console.log("Resultados DynamoDB:");
    console.log("- Total items:", result.Items?.length || 0);
    console.log("- Scanned count:", result.ScannedCount);
    console.log("- Count:", result.Count);

    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
        "base64"
      );
    }

    // Si hay filtros aplicados pero no hay resultados, asegurar que devolvemos array vacío
    const productos = result.Items || [];

    return lambdaResponse(200, {
      productos: productos,
      count: productos.length,
      nextKey: nextKey,
      hasMore: !!result.LastEvaluatedKey,
      filtros_aplicados: {
        categoria,
        subcategoria,
        laboratorio,
        requiere_receta,
        precio_min,
        precio_max,
        search,
      },
      debug: {
        query_params_recibidos: queryParams,
        filtros_detectados: {
          categoria: !!categoria,
          subcategoria: !!subcategoria,
          laboratorio: !!laboratorio,
          requiere_receta: requiere_receta !== undefined,
          precio_min: precio_min !== null,
          precio_max: precio_max !== null,
          search: !!search,
        },
        dynamodb_scanned: result.ScannedCount,
        dynamodb_count: result.Count,
        filters_applied: filterExpressions.length > 0,
        filter_expression: params.FilterExpression || "none",
        total_filter_expressions: filterExpressions.length,
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

    // Debug: log completo del evento
    console.log("Event completo:", JSON.stringify(event, null, 2));

    // Múltiples formas de obtener la categoría
    let categoria = null;

    // Opción 1: Desde pathParameters (estándar)
    if (event.pathParameters && event.pathParameters.categoria) {
      categoria = event.pathParameters.categoria;
    }

    // Opción 2: Desde path si pathParameters no funciona
    if (
      !categoria &&
      event.path &&
      typeof event.path === "object" &&
      event.path.categoria
    ) {
      categoria = event.path.categoria;
    }

    // Opción 3: Desde resource path parsing
    if (!categoria && event.resource) {
      const matches = event.resource.match(
        /\/productos\/categorias\/([^\/]+)\/subcategorias/
      );
      if (matches && matches[1]) {
        categoria = matches[1];
      }
    }

    // Opción 4: Desde requestPath parsing
    if (!categoria && event.requestPath) {
      const matches = event.requestPath.match(
        /\/productos\/categorias\/([^\/]+)\/subcategorias/
      );
      if (matches && matches[1]) {
        categoria = matches[1];
      }
    }

    // Opción 5: Desde requestContext path
    if (!categoria && event.requestContext && event.requestContext.path) {
      const matches = event.requestContext.path.match(
        /\/productos\/categorias\/([^\/]+)\/subcategorias/
      );
      if (matches && matches[1]) {
        categoria = matches[1];
      }
    }

    // Opción 6: Desde requestContext resourcePath
    if (
      !categoria &&
      event.requestContext &&
      event.requestContext.resourcePath
    ) {
      const matches = event.requestContext.resourcePath.match(
        /\/productos\/categorias\/([^\/]+)\/subcategorias/
      );
      if (matches && matches[1]) {
        categoria = matches[1];
      }
    }

    console.log("Categoria extraída:", categoria);

    if (!categoria) {
      return lambdaResponse(400, {
        error: "Categoría requerida",
        debug: {
          pathParameters: event.pathParameters,
          path: event.path,
          resource: event.resource,
          requestPath: event.requestPath,
          requestContext: event.requestContext,
        },
      });
    }

    // Decodificar URL encoding si es necesario
    const categoriaDecoded = decodeURIComponent(categoria);
    console.log("Categoria original:", categoria);
    console.log("Categoria decoded:", categoriaDecoded);

    // Buscar la categoría (primero tal como viene, luego decodificada)
    let categoriasDisponibles = CATEGORIAS_DISPONIBLES;
    let categoriaEncontrada = null;
    let categoriaKey = null;

    if (categoriasDisponibles[categoria]) {
      categoriaEncontrada = categoriasDisponibles[categoria];
      categoriaKey = categoria;
    } else if (categoriasDisponibles[categoriaDecoded]) {
      categoriaEncontrada = categoriasDisponibles[categoriaDecoded];
      categoriaKey = categoriaDecoded;
    }

    if (!categoriaEncontrada) {
      return lambdaResponse(404, {
        error: `Categoría '${categoria}' no encontrada`,
        categoria_decoded: categoriaDecoded,
        categorias_disponibles: Object.keys(CATEGORIAS_DISPONIBLES),
      });
    }

    return lambdaResponse(200, {
      categoria: categoriaKey,
      subcategorias: categoriaEncontrada,
      total: categoriaEncontrada.length,
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

// Búsqueda de productos - SOLO en nombre y descripción
// Búsqueda de productos por nombre y descripción únicamente
export async function buscarProductos(event, context) {
  try {
    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;
    const queryParams = event.queryStringParameters || {};

    // Obtener término de búsqueda
    const q = queryParams.q || "";
    const limit = parseInt(queryParams.limit) || 10;

    if (!q || q.trim().length === 0) {
      return lambdaResponse(400, {
        error: "Parámetro 'q' requerido para la búsqueda",
        ejemplo: "/productos/buscar?q=vitamina&limit=10",
      });
    }

    const searchTerm = q.trim().toLowerCase();

    // Paginación
    let lastEvaluatedKey = null;
    if (queryParams.nextKey) {
      try {
        lastEvaluatedKey = JSON.parse(
          Buffer.from(queryParams.nextKey, "base64").toString()
        );
      } catch (error) {
        console.log("Error decodificando nextKey:", error);
      }
    }

    // Consulta DynamoDB - SOLO busca en nombre y descripción
    const params = {
      TableName: tableName,
      KeyConditionExpression: "tenant_id = :tenant_id",
      FilterExpression:
        "(contains(#nombre, :search) OR contains(descripcion, :search)) AND activo = :activo",
      ExpressionAttributeNames: {
        "#nombre": "nombre",
      },
      ExpressionAttributeValues: {
        ":tenant_id": tenantId,
        ":search": searchTerm,
        ":activo": true,
      },
      Limit: limit,
      ScanIndexForward: false,
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.send(new QueryCommand(params));
    let productos = result.Items || [];

    // Calcular relevancia: priorizar coincidencias en nombre
    productos = productos.map((producto) => {
      const nombre = producto.nombre.toLowerCase();
      const descripcion = (producto.descripcion || "").toLowerCase();
      let score = 0;

      // Puntuación por nombre (máxima prioridad)
      if (nombre.includes(searchTerm)) {
        score += 100;
        if (nombre.startsWith(searchTerm)) {
          score += 50; // Bonus si empieza con el término
        }
      }

      // Puntuación por descripción (menor prioridad)
      if (descripcion.includes(searchTerm)) {
        score += 20;
      }

      return { ...producto, _score: score };
    });

    // Ordenar por relevancia
    productos.sort((a, b) => {
      if (b._score !== a._score) {
        return b._score - a._score;
      }
      return a.nombre.localeCompare(b.nombre);
    });

    // Limpiar campo temporal de score
    productos = productos.map(({ _score, ...producto }) => producto);

    // Preparar nextKey para paginación
    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
        "base64"
      );
    }

    return lambdaResponse(200, {
      productos,
      count: productos.length,
      searchTerm,
      pagination: {
        limit,
        hasMore: !!result.LastEvaluatedKey,
        nextKey,
      },
    });
  } catch (error) {
    console.error("Error en búsqueda de productos:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Buscar productos por categoría exacta
export async function buscarPorCategoria(event, context) {
  try {
    // Debug: ver qué llega en el evento
    console.log("=== DEBUG BUSCAR POR CATEGORÍA ===");
    console.log("Event completo:", JSON.stringify(event, null, 2));
    console.log("PathParameters:", event.pathParameters);
    console.log("Path:", event.path);
    console.log("Resource:", event.resource);
    console.log("RequestPath:", event.requestPath);

    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;
    const queryParams = event.queryStringParameters || {};

    // Múltiples formas de obtener la categoría
    let categoria = null;

    // Opción 1: Desde pathParameters (estándar)
    if (event.pathParameters && event.pathParameters.categoria) {
      categoria = decodeURIComponent(event.pathParameters.categoria);
    }

    // Opción 2: Desde path si pathParameters no funciona
    if (
      !categoria &&
      event.path &&
      typeof event.path === "object" &&
      event.path.categoria
    ) {
      categoria = decodeURIComponent(event.path.categoria);
    }

    // Opción 3: Desde resource path parsing
    if (!categoria && event.resource) {
      const matches = event.resource.match(/\/productos\/categoria\/([^\/]+)/);
      if (matches && matches[1]) {
        categoria = decodeURIComponent(matches[1]);
      }
    }

    // Opción 4: Desde requestPath parsing
    if (!categoria && event.requestPath) {
      const matches = event.requestPath.match(
        /\/productos\/categoria\/([^\/]+)/
      );
      if (matches && matches[1]) {
        categoria = decodeURIComponent(matches[1]);
      }
    }

    // Opción 5: Desde requestContext path
    if (!categoria && event.requestContext && event.requestContext.path) {
      const matches = event.requestContext.path.match(
        /\/productos\/categoria\/([^\/]+)/
      );
      if (matches && matches[1]) {
        categoria = decodeURIComponent(matches[1]);
      }
    }

    console.log("Categoría extraída:", categoria);

    if (!categoria) {
      return lambdaResponse(400, {
        error: "Categoría requerida en el path",
        ejemplo: "/productos/categoria/Analgésicos",
        debug: {
          pathParameters: event.pathParameters,
          path: event.path,
          resource: event.resource,
          requestPath: event.requestPath,
        },
      });
    }

    // Parámetros de paginación
    const limite = parseInt(queryParams.limite || queryParams.limit) || 20;
    const pagina = parseInt(queryParams.pagina || queryParams.page) || 1;

    console.log("=== BUSCAR POR CATEGORÍA ===");
    console.log("Categoría:", categoria);
    console.log("Límite:", limite);
    console.log("Página:", pagina);

    // Construir parámetros de consulta
    const params = {
      TableName: tableName,
      KeyConditionExpression: "tenant_id = :tenant_id",
      FilterExpression: "#categoria = :categoria AND activo = :activo",
      ExpressionAttributeNames: {
        "#categoria": "categoria",
      },
      ExpressionAttributeValues: {
        ":tenant_id": tenantId,
        ":categoria": categoria,
        ":activo": true,
      },
      Limit: limite,
      ScanIndexForward: false,
    };

    const result = await dynamodb.send(new QueryCommand(params));
    const productos = result.Items || [];

    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
        "base64"
      );
    }

    console.log("Productos encontrados:", productos.length);

    return lambdaResponse(200, {
      productos: productos,
      count: productos.length,
      categoria_buscada: categoria,
      paginacion: {
        pagina_actual: pagina,
        limite: limite,
        hay_mas: !!result.LastEvaluatedKey,
        nextKey: nextKey,
      },
    });
  } catch (error) {
    console.error("Error buscando por categoría:", error);
    return lambdaResponse(500, { error: "Error interno del servidor" });
  }
}

// Buscar productos por subcategoría exacta - VERSIÓN REFACTORIZADA
export async function buscarPorSubcategoria(event, context) {
  try {
    // Debug: ver qué llega en el evento
    console.log("=== DEBUG BUSCAR POR SUBCATEGORÍA ===");
    console.log("Event completo:", JSON.stringify(event, null, 2));
    console.log("PathParameters:", event.pathParameters);
    console.log("Path:", event.path);
    console.log("Resource:", event.resource);
    console.log("RequestPath:", event.requestPath);

    // Validar token
    const tokenValidation = validarToken(event);
    if (!tokenValidation.valid) {
      return lambdaResponse(401, { error: tokenValidation.error });
    }

    const tenantId = tokenValidation.usuario.tenant_id;
    const queryParams = event.queryStringParameters || {};

    // Múltiples formas de obtener la subcategoría (usando misma lógica que categoría)
    let subcategoria = null;

    // PRIORIDAD 1: Desde el body (para casos con JSON raw)
    if (event.body) {
      try {
        let body;
        if (typeof event.body === "string") {
          body = JSON.parse(event.body);
        } else {
          body = event.body;
        }

        if (body && body.subcategoria) {
          subcategoria = body.subcategoria.trim();
          console.log("✅ Subcategoría extraída desde BODY:", subcategoria);
        }
      } catch (error) {
        console.log(
          "⚠️ Error parseando body JSON, continuando con path params:",
          error.message
        );
      }
    }

    // PRIORIDAD 2: Desde pathParameters (estándar de API Gateway)
    if (
      !subcategoria &&
      event.pathParameters &&
      event.pathParameters.subcategoria
    ) {
      subcategoria = decodeURIComponent(event.pathParameters.subcategoria);
      console.log(
        "✅ Subcategoría extraída desde pathParameters:",
        subcategoria
      );
    }

    // PRIORIDAD 3: Desde path si pathParameters no funciona
    if (
      !subcategoria &&
      event.path &&
      typeof event.path === "object" &&
      event.path.subcategoria
    ) {
      subcategoria = decodeURIComponent(event.path.subcategoria);
      console.log("✅ Subcategoría extraída desde path object:", subcategoria);
    }

    // PRIORIDAD 4: Desde resource path parsing
    if (!subcategoria && event.resource) {
      const matches = event.resource.match(
        /\/productos\/subcategoria\/([^\/]+)/
      );
      if (matches && matches[1]) {
        subcategoria = decodeURIComponent(matches[1]);
        console.log("✅ Subcategoría extraída desde resource:", subcategoria);
      }
    }

    // PRIORIDAD 5: Desde requestPath parsing
    if (!subcategoria && event.requestPath) {
      const matches = event.requestPath.match(
        /\/productos\/subcategoria\/([^\/]+)/
      );
      if (matches && matches[1]) {
        subcategoria = decodeURIComponent(matches[1]);
        console.log(
          "✅ Subcategoría extraída desde requestPath:",
          subcategoria
        );
      }
    }

    // PRIORIDAD 6: Desde requestContext path
    if (!subcategoria && event.requestContext && event.requestContext.path) {
      const matches = event.requestContext.path.match(
        /\/productos\/subcategoria\/([^\/]+)/
      );
      if (matches && matches[1]) {
        subcategoria = decodeURIComponent(matches[1]);
        console.log(
          "✅ Subcategoría extraída desde requestContext.path:",
          subcategoria
        );
      }
    }

    console.log("🔍 Subcategoría final extraída:", subcategoria);

    if (!subcategoria) {
      return lambdaResponse(400, {
        error: "Subcategoría requerida en el path o body",
        ejemplo_path: "/productos/subcategoria/Leches%20de%20Fórmula",
        ejemplo_body: '{"subcategoria": "Leches de Fórmula"}',
        debug: {
          pathParameters: event.pathParameters,
          path: event.path,
          resource: event.resource,
          requestPath: event.requestPath,
          body_parseado: event.body ? "presente" : "ausente",
        },
      });
    }

    // Parámetros de paginación
    const limite = parseInt(queryParams.limite || queryParams.limit) || 20;
    const pagina = parseInt(queryParams.pagina || queryParams.page) || 1;

    console.log("=== BUSCAR POR SUBCATEGORÍA ===");
    console.log("Subcategoría:", subcategoria);
    console.log("Límite:", limite);
    console.log("Página:", pagina);

    // Construir parámetros de consulta (misma estructura que categoría)
    const params = {
      TableName: tableName,
      KeyConditionExpression: "tenant_id = :tenant_id",
      FilterExpression: "subcategoria = :subcategoria AND activo = :activo",
      ExpressionAttributeValues: {
        ":tenant_id": tenantId,
        ":subcategoria": subcategoria,
        ":activo": true,
      },
      Limit: limite,
      ScanIndexForward: false,
    };

    console.log("📋 Parámetros DynamoDB:", JSON.stringify(params, null, 2));

    const result = await dynamodb.send(new QueryCommand(params));
    const productos = result.Items || [];

    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
        "base64"
      );
    }

    console.log("📊 Productos encontrados:", productos.length);
    console.log("📊 DynamoDB Count:", result.Count);
    console.log("📊 DynamoDB ScannedCount:", result.ScannedCount);

    return lambdaResponse(200, {
      productos: productos,
      count: productos.length,
      subcategoria_buscada: subcategoria,
      paginacion: {
        pagina_actual: pagina,
        limite: limite,
        hay_mas: !!result.LastEvaluatedKey,
        nextKey: nextKey,
      },
      debug: {
        subcategoria_extraida: subcategoria,
        parametros_path: event.pathParameters,
        filtro_aplicado: `subcategoria = ${subcategoria}`,
        dynamodb_count: result.Count,
        dynamodb_scanned: result.ScannedCount,
      },
    });
  } catch (error) {
    console.error("❌ Error buscando por subcategoría:", error);
    return lambdaResponse(500, {
      error: "Error interno del servidor",
      debug: {
        error_message: error.message,
        error_stack: error.stack,
      },
    });
  }
}
