import {
  z,
  ZodTypeAny,
  ZodObject,
  ZodRawShape,
  ZodOptional,
  ZodNullable,
  ZodTuple,
  ZodArray,
  ZodTupleItems,
  ZodEnum,
  AnyZodObject,
} from "zod";

export type DeepPartialSpecial<T extends ZodTypeAny> =
  T extends ZodObject<ZodRawShape>
    ? ZodObject<
        {
          [k in keyof T["shape"]]: T["shape"][k] extends AnyZodObject
            ? ZodOptional<DeepPartialSpecial<T["shape"][k]>>
            : DeepPartialSpecial<T["shape"][k]>;
        },
        T["_def"]["unknownKeys"],
        T["_def"]["catchall"]
      >
    : T extends ZodArray<infer Type, infer Card>
    ? ZodArray<DeepPartialSpecial<Type>, Card>
    : T extends ZodOptional<infer Type>
    ? ZodOptional<DeepPartialSpecial<Type>>
    : T extends ZodNullable<infer Type>
    ? ZodNullable<DeepPartialSpecial<Type>>
    : T extends ZodTuple<infer Items>
    ? {
        [k in keyof Items]: Items[k] extends ZodTypeAny
          ? DeepPartialSpecial<Items[k]>
          : never;
      } extends infer PI
      ? PI extends ZodTupleItems
        ? ZodTuple<PI>
        : never
      : never
    : T;

function deepPartialifySpecial<T extends ZodTypeAny>(schema: T): any {
  if (schema instanceof ZodObject) {
    const newShape: any = {};

    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      if (fieldSchema instanceof ZodObject || fieldSchema instanceof ZodEnum) {
        newShape[key] = ZodOptional.create(deepPartialifySpecial(fieldSchema));
      } else {
        newShape[key] = deepPartialifySpecial(fieldSchema);
      }
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape,
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialifySpecial(schema.element),
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialifySpecial(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialifySpecial(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(
      schema.items.map((item: any) => deepPartialifySpecial(item))
    );
  } else {
    return schema;
  }
}

function partialForReceive<T extends ZodTypeAny>(
  schema: T
): DeepPartialSpecial<T> {
  return deepPartialifySpecial(schema) as DeepPartialSpecial<T>;
}

const mySchema = z.object({
  foo: z.number(),
  bar: z.number(),
  things: z.array(z.string()),
  obj_things: z.array(z.object({ a: z.number() })),
  obj: z.object({ b: z.number() }),
  name: z.string(),
});

const partialSchema = mySchema.deepPartial();
export type SendType = z.infer<typeof partialSchema>;

// We don't send empty objects – they will become undefined.
function cleanForSend(inObject: { [key: string]: any }) {
  if (typeof inObject !== "object" || Array.isArray(inObject)) {
    return inObject;
  }
  const copy: { [key: string]: any } = {};
  for (const [key, value] of Object.entries(inObject)) {
    if (typeof value === "object" && value) {
      if (Object.keys(value).length === 0) {
        continue;
      } else if (Array.isArray(value)) {
        copy[key] = value.map((item) => cleanForSend(item));
      } else {
        copy[key] = cleanForSend(inObject[key]);
        continue;
      }
    }
    copy[key] = inObject[key];
  }
  return copy;
}

export function send(d: SendType) {
  return cleanForSend(d);
}

function hydrate(data: unknown, schema: z.Schema): unknown {
  if (schema instanceof z.ZodObject && typeof data === "object" && data) {
    return fillObject(data, schema);
  } else if (schema instanceof z.ZodArray && Array.isArray(data)) {
    return data.map((item) => hydrate(item, schema.element));
  } else if (data === undefined) {
    if (schema instanceof z.ZodNumber) {
      return 0;
    } else if (schema instanceof z.ZodArray) {
      return [];
    } else if (schema instanceof z.ZodString) {
      return "";
    }
  }
  return data;
}

function fillObject(inObject: { [key: string]: any }, schema: z.AnyZodObject) {
  const filled: { [key: string]: any } = {};
  for (const [key, valueSchema] of Object.entries(schema.shape)) {
    if (valueSchema instanceof z.Schema) {
      filled[key] = hydrate(inObject[key], valueSchema);
    }
  }
  return filled;
}

const schemaForRecv = partialForReceive(mySchema);
export type ReceiveType = z.infer<typeof schemaForRecv>;

function parseForReceive<T extends z.AnyZodObject>(d: any, schema: T) {
  return z
    .preprocess((v) => {
      return hydrate(v, schema);
    }, schema)
    .parse(d);
}

export function receive(d: any) {
  return parseForReceive(d, schemaForRecv);
}
