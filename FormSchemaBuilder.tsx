// Form Schema Builder
//
// Drag a field type from the palette onto the canvas to add it, configure
// each field's label / required flag / (for selects) options, and watch
// two things update live: the generated JSON Schema, and a preview form
// that is rendered FROM that schema — not from the internal field list
// directly — so the schema is provably a complete, faithful description of
// the form rather than a decorative side artifact.
//
// Usage:
//   <FormSchemaBuilder />
//
// Property keys are derived from each field's label (camelCased,
// deduplicated on collision) the moment the schema is built.

import { useState } from 'react';

type FieldType = 'text' | 'number' | 'checkbox' | 'select' | 'textarea';

interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[]; // 'select' only
}

interface SchemaProperty {
  title: string;
  type: 'string' | 'number' | 'boolean';
  format?: 'textarea';
  enum?: string[];
}

interface JsonSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required: string[];
}

function slugify(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'field';
  return (
    words
      .map((w, i) => {
        const lower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
        return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join('') || 'field'
  );
}

function buildSchema(fields: FieldDef[]): { schema: JsonSchema; keys: string[] } {
  const properties: JsonSchema['properties'] = {};
  const required: string[] = [];
  const usedKeys = new Set<string>();
  const keys: string[] = [];

  for (const f of fields) {
    const base = slugify(f.label);
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${base}${suffix++}`;
    usedKeys.add(key);
    keys.push(key);

    if (f.type === 'text') properties[key] = { title: f.label, type: 'string' };
    else if (f.type === 'number') properties[key] = { title: f.label, type: 'number' };
    else if (f.type === 'checkbox') properties[key] = { title: f.label, type: 'boolean' };
    else if (f.type === 'textarea') properties[key] = { title: f.label, type: 'string', format: 'textarea' };
    else if (f.type === 'select') properties[key] = { title: f.label, type: 'string', enum: f.options ?? [] };

    if (f.required) required.push(key);
  }

  return { schema: { type: 'object', properties, required }, keys };
}

const PALETTE: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'select', label: 'Select' },
  { type: 'textarea', label: 'Textarea' },
];

function defaultLabel(type: FieldType, index: number): string {
  const names: Record<FieldType, string> = {
    text: 'Text Field', number: 'Number Field', checkbox: 'Checkbox', select: 'Select Field', textarea: 'Textarea Field',
  };
  return `${names[type]} ${index}`;
}

function SchemaForm({ schema }: { schema: JsonSchema }) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});

  return (
    <div data-testid="schema-form" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.entries(schema.properties).map(([key, prop]) => {
        const isRequired = schema.required.includes(key);
        if (prop.type === 'boolean') {
          return (
            <label key={key} data-testid="form-field" data-field-key={key} style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!!values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
              />{' '}
              {prop.title}
              {isRequired && ' *'}
            </label>
          );
        }
        if (prop.enum) {
          return (
            <label key={key} data-testid="form-field" data-field-key={key} style={{ fontSize: 13, display: 'block' }}>
              {prop.title}
              {isRequired && ' *'}
              <select
                value={(values[key] as string) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                style={{ display: 'block', marginTop: 2 }}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {prop.enum.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (prop.format === 'textarea') {
          return (
            <label key={key} data-testid="form-field" data-field-key={key} style={{ fontSize: 13, display: 'block' }}>
              {prop.title}
              {isRequired && ' *'}
              <textarea
                value={(values[key] as string) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                style={{ display: 'block', marginTop: 2, width: '100%' }}
              />
            </label>
          );
        }
        return (
          <label key={key} data-testid="form-field" data-field-key={key} style={{ fontSize: 13, display: 'block' }}>
            {prop.title}
            {isRequired && ' *'}
            <input
              type={prop.type === 'number' ? 'number' : 'text'}
              required={isRequired}
              value={(values[key] as string) ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              style={{ display: 'block', marginTop: 2 }}
            />
          </label>
        );
      })}
    </div>
  );
}

export default function FormSchemaBuilder() {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [dragType, setDragType] = useState<FieldType | null>(null);
  const [overCanvas, setOverCanvas] = useState(false);
  let fieldCounter = fields.length;

  const { schema, keys } = buildSchema(fields);

  function addField(type: FieldType) {
    fieldCounter += 1;
    setFields((prev) => [
      ...prev,
      { id: `f${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, label: defaultLabel(type, prev.length + 1), required: false, options: type === 'select' ? ['Option A', 'Option B'] : undefined },
    ]);
  }

  function updateField(id: string, patch: Partial<FieldDef>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragType) return;
    const canvas = document.querySelector('[data-testid="canvas"]');
    const rect = canvas?.getBoundingClientRect();
    if (rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      addField(dragType);
    }
    setDragType(null);
    setOverCanvas(false);
  }

  return (
    <div
      style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', gap: 16, padding: 16 }}
      onPointerMove={(e) => {
        if (!dragType) return;
        const canvas = document.querySelector('[data-testid="canvas"]');
        const rect = canvas?.getBoundingClientRect();
        setOverCanvas(!!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
      }}
      onPointerUp={handlePointerUp}
    >
      <div style={{ width: 100 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Palette</div>
        {PALETTE.map((p) => (
          <div
            key={p.type}
            data-testid="palette-item"
            data-field-type={p.type}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              setDragType(p.type);
            }}
            style={{ padding: '6px 8px', marginBottom: 6, background: '#21262d', border: '1px solid #333', borderRadius: 4, fontSize: 12, cursor: 'grab', userSelect: 'none' }}
          >
            {p.label}
          </div>
        ))}
      </div>

      <div
        data-testid="canvas"
        style={{ width: 260, minHeight: 200, border: overCanvas ? '2px dashed #3b82f6' : '2px dashed #333', borderRadius: 4, padding: 8 }}
      >
        {fields.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>Drag fields here</div>}
        {fields.map((f, i) => (
          <div key={f.id} data-testid="canvas-field" data-field-id={f.id} data-key={keys[i]} style={{ border: '1px solid #333', borderRadius: 4, padding: 6, marginBottom: 6, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <input
                aria-label={`Label for field ${i + 1}`}
                value={f.label}
                onChange={(e) => updateField(f.id, { label: e.target.value })}
                style={{ flex: 1, fontSize: 12 }}
              />
              <button aria-label={`Remove field ${i + 1}`} onClick={() => removeField(f.id)}>
                ✕
              </button>
            </div>
            <label style={{ display: 'block', marginTop: 4 }}>
              <input type="checkbox" checked={f.required} onChange={(e) => updateField(f.id, { required: e.target.checked })} /> Required
            </label>
            {f.type === 'select' && (
              <input
                aria-label={`Options for field ${i + 1}`}
                value={(f.options ?? []).join(',')}
                onChange={(e) => updateField(f.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                placeholder="Option A, Option B"
                style={{ width: '100%', marginTop: 4, fontSize: 12 }}
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ width: 220 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Generated JSON Schema</div>
        <pre data-testid="schema-json" style={{ fontSize: 10, background: '#161b22', padding: 6, maxHeight: 200, overflow: 'auto' }}>
          {JSON.stringify(schema, null, 2)}
        </pre>
      </div>

      <div style={{ width: 220 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Preview (rendered from schema)</div>
        <SchemaForm schema={schema} />
      </div>
    </div>
  );
}
