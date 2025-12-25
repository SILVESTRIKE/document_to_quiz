/**
 * Swagger Configuration
 */
export const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Monolith Template API",
            version: "1.0.0",
            description: "API documentation for the monolith template",
        },
        servers: [
            {
                url: process.env.API_URL || "http://localhost:5000",
                description: "Development server",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ["./src/routes/*.ts", "./src/controllers/*.ts"],
};
