# Product naming standards

This document defines how product **names** are built for each product type. The rules match legacy stock labeling so catalog products and old stock rows read the same way.

**Implementation (today):**

| Function | File | Role |
|----------|------|------|
| `buildStockDescriptor()` | `src/lib/stockLabel.ts` | Builds the descriptor string |
| `buildStockLabel()` | `src/lib/stockLabel.ts` | Descriptor + `(Type)` |
| `buildCatalogProductName()` | `src/lib/inventory/productLabel.ts` | Same as descriptor → saved to `products.name` |
| `buildProductLabel()` | `src/lib/inventory/productLabel.ts` | Display: `{products.name} ({Type})` |

**Structured spec (for future DB):** `src/lib/inventory/productNamingStandards.ts`

---

## Two layers

Every product has:

1. **Descriptor** — the identity string (what we store in `products.name` for standard types).
2. **Full label** — descriptor plus type in parentheses, e.g. `BL-442 India (Brake lining)`.

```
full label = "{descriptor} ({type display name})"
```

---

## Per-type standards

### Glass

**Form attributes:** `thickness`, `color`, `figure`, `factor`  
**Used in name:** `thickness`, `color`, `figure`, `country` (factor is **not** in the name)

**Rule:**

```
descriptor = "{thickness}mm {color} {figure}"
if country set and not already in descriptor → append " {country}"
full label = "{descriptor} (Glass)"
```

| thickness | color | figure | country | Descriptor |
|-----------|-------|--------|---------|------------|
| 5 | blue | plain | — | `5mm blue plain` |
| 5 | blue | plain | Ethiopia | `5mm blue plain Ethiopia` |

**Auto `products.name`:** yes

---

### Brake lining

**Form attributes:** `model_number`, `country`  
**Used in name:** same

**Rule:**

```
if any of thickness/color/figure exist → glass-style (unusual for this type)
else descriptor = model_number OR country OR "Stock"
if country set and not already in descriptor → append " {country}"
full label = "{descriptor} (Brake lining)"
```

Aliases: `brake_pad`, `break_pad` → `brake_lining`

| model_number | country | Descriptor |
|--------------|---------|------------|
| BL-442 | India | `BL-442 India` |
| BL-442 | — | `BL-442` |
| — | India | `India` |

**Auto `products.name`:** yes

---

### Coffee tools

**Form attributes:** `name`, `capacity`, `capacity_unit`  
**Used in name:** all three (`capacity` + `capacity_unit` merged, e.g. `1000` + `ml` → `1000ML`)

**Rule:**

```
descriptor = "{attributes.name} {capacity}{capacity_unit}"
full label = "{descriptor} (Coffee Tools)"
```

Example: `French Press` + `1000` + `ml` → `French Press 1000ML (Coffee Tools)`

**Auto `products.name`:** yes (tool name is in `attributes.name`, not a separate Name field)

---

### Other / custom types

- No entry in `PRODUCT_TYPE_FIELDS` → manual **Name** on the product form.
- `products.name` is entered by the merchant.
- Full label still appends `(Type)` when type is known.

---

## Where values are read from

| Row kind | Type & attributes source |
|----------|---------------------------|
| Catalog product (`product_id` set) | `products.product_type`, `products.attributes`, `products.name` |
| Legacy stock (`product_id` null) | `stock.type` / `stock.product_type`, `stock.attributes`, legacy columns (`thickness`, `model_number`, …) |

Orders require a linked `product_id`; legacy stock is display-only until linked.

---

## Future: company-level rules in DB

Planned direction (not implemented yet):

- Store naming rules per **company** + **product_type** (field list, descriptor template or builder key).
- At runtime: `companyRule ?? defaultRule` from this document / `productNamingStandards.ts`.
- Keep `buildStockDescriptor()` as the default implementation; override only when a company row exists.

Suggested DB shape (sketch):

```
company_product_type_naming
  company_id
  product_type_id
  attribute_fields   jsonb   -- form fields
  descriptor_fields  jsonb   -- fields in name
  descriptor_rule    text    -- e.g. "glass_v1" enum → code path
  auto_generate_name boolean
```

Until then, defaults in `productNamingStandards.ts` and `PRODUCT_TYPE_FIELDS` in `parseForm.ts` are authoritative.
