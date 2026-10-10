import Ajv2020 from 'ajv/dist/2020';
import schema from '../../../../../contracts/instancePolicySchema.json';

type PolicySchema = {
  type?: string;
  properties?: Record<string, PolicySchema>;
  required?: string[];
  items?: PolicySchema;
  [key: string]: unknown;
};

function requireFields(node: PolicySchema): PolicySchema {
  if (!node.properties) return node;
  return {
    ...node,
    required: Object.keys(node.properties).filter((key) => key !== '$schema'),
    properties: Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [
        key,
        requireFields(value),
      ]),
    ),
  };
}

const validateFile = new Ajv2020({ allErrors: true }).compile(schema);
const validateComplete = new Ajv2020({ allErrors: true }).compile(
  requireFields(schema),
);

export function instancePolicySchemaIssues(
  value: unknown,
  partial = false,
): string[] {
  const validate = partial ? validateFile : validateComplete;
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => {
    const field = error.instancePath.replace(/\//g, '.') || 'root';
    const detail =
      error.params.additionalProperty ?? error.params.missingProperty;
    return `${field}${detail ? `.${String(detail)}` : ''} ${error.message}`;
  });
}
