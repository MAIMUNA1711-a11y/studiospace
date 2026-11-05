import { ObjectId } from "mongodb";
import { ApiError } from "./ApiError";

const HEX24 = /^[a-fA-F0-9]{24}$/;

/** Strict ObjectId parsing: ObjectId.isValid() also accepts any 12-char string, which we do not want. */
export function parseObjectId(value: unknown, label = "id"): ObjectId {
  if (typeof value !== "string" || !HEX24.test(value)) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
  return new ObjectId(value);
}
