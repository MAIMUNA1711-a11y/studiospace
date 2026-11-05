// Must be imported FIRST in every test file: env.ts validates process.env at import time.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27018";
process.env.MONGODB_DB_NAME = `studiospace_test_${process.pid}`;
process.env.CLIENT_URL = "http://localhost:3000";
process.env.JWKS_URL = "http://localhost:3000/api/auth/jwks";
process.env.JWT_ISSUER = "http://localhost:3000";
process.env.JWT_AUDIENCE = "http://localhost:3000";
process.env.BOOKING_UTC_OFFSET_MINUTES = "0";
