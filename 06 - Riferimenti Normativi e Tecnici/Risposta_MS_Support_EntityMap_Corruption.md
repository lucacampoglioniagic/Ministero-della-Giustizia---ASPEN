Subject: RE: [Case] agc_canestro / agc_fascicolo filtered view corruption — diagnostic findings

Hello Iwayemi,

Thank you for the detailed guidance. I went through each of the checks you suggested via the
Dataverse Web API against our environment and can confirm the metadata inconsistency, plus one
additional detail that may point to the actual root cause.

**1. Dependencies of agc_fascicolo referencing agc_canestro**
The custom table `agc_fascicolo` still has a Lookup attribute `agc_canestro`
(SchemaName: `agc_Canestro`, AttributeMetadataId: `29c5bf7a-0ee4-4712-9441-c9eee086895f`) whose
`Targets` property still resolves to `agc_canestro`. However, querying both
`ManyToOneRelationships` on `agc_fascicolo` and `OneToManyRelationships` on `agc_canestro` returns
**zero** relationships between the two tables. In other words, the lookup column's metadata still
declares a target entity, but the backing relationship record no longer exists — exactly the kind
of orphaned reference you described.

**2. Lookup column / relationship existence**
Confirmed as above: the column exists at the attribute-metadata level, the relationship does not.

**3. PublishAllXml**
We re-ran `PublishAllXml` today and it now completes successfully (HTTP 204, no error, no
correlation id returned). So the generic "publish all customizations" operation is currently not
blocked — the failure only manifests on schema-changing operations against `agc_canestro` /
`agc_fascicolo` (e.g. attempting to delete `agc_canestro`).

**4. Visibility across solutions**
`agc_canestro` (EntityMetadataId `77b92dc3-7caa-4ece-a422-5a6dcc13b227`) is registered as a
solution component (ComponentType 1 — Entity) in exactly two **unmanaged** solutions:
- "Default Solution" (uniquename `Default`)
- "ASPEN POC Ribbon" (uniquename `ASPENPOCRibbon`)
No managed solution references it. The orphaned lookup attribute on `agc_fascicolo`
(MetadataId `29c5bf7a-0ee4-4712-9441-c9eee086895f`) is **not** registered as a solution component
in any solution — it is effectively invisible to solution-based tracking, which is consistent with
it being a leftover from an incomplete deletion.

**5. Table deletion attempt / additional root-cause detail**
Calling `RetrieveDependenciesForDelete(ObjectId=77b92dc3-7caa-4ece-a422-5a6dcc13b227,ComponentType=1)`
(i.e. attempting to delete `agc_canestro`) returns 2 dependency records blocking deletion:
- `dependentcomponentobjectid = 1e8be637-4f63-f111-ab0c-7ced8d4558ae`
- `dependentcomponentobjectid = bea73062-4f63-f111-ab0c-7ced8d72f54e`

Neither id resolves against `RelationshipDefinitions` (404 Not Found) nor against
`solutioncomponents` (no rows) — they are references to components that no longer exist anywhere
in retrievable metadata.

More importantly, calling `RetrieveDependentComponents(ObjectId=77b92dc3-7caa-4ece-a422-5a6dcc13b227,ComponentType=1)`
(same table) throws:

> "No rows could be found for EntityRelationshipRole with id 1087bc5f-0e3f-41e4-9d7f-5ef1eb94633f if
> EntityRelationshipRole were published"

This points to an **orphaned EntityRelationshipRole** (`1087bc5f-0e3f-41e4-9d7f-5ef1eb94633f`) —
likely a leftover relationship-role record from the same incomplete deletion/uninstall — which
appears to be the actual object blocking dependency resolution and, by extension, schema
operations on `agc_canestro`. This looks like a strong candidate for the backend fix, since it is
not resolvable or removable through any public Web API or Maker Portal action available to us.

**Recent activity for context**
This corruption first surfaced during table cleanup work on `agc_canestro` (we deleted it and
recreated equivalent tables under a new name, `agc_canestrofascicolo`, to work around the issue) —
no solution import/export or managed-solution uninstall was performed around that time; the
sequence was: manual record deletion attempts on `agc_canestro` → table deletion attempt (failed)
→ discovery of this dependency corruption.

Could you confirm whether the orphaned `EntityRelationshipRole` (`1087bc5f-0e3f-41e4-9d7f-5ef1eb94633f`)
can be removed on the backend? That would likely unblock both the `agc_canestro` table deletion and
any further schema changes on `agc_fascicolo`.

Happy to provide any further diagnostic output (raw JSON responses, additional queries) if useful.

Best regards,
Luca Campoglioni
