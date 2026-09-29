# Private places

Users can create up to 20 account-owned places within worlds they can access. A place can be a home or another private setting, with a name, description, activities, optional district, required photo, and opening hours (24/7 by default). Creation, selection, editing, and archiving live in the plan picker, so an individual or group can invite companions through the same planning flow as authored venues.

## Data and access

- Private places are rows in `together_locations` with `owner_user_id`. They retain the existing location ID used by shared plans, scenes, dialogue context, media jobs, and moments.
- RLS exposes each private row only to its owner. The service-role endpoints repeat that owner check before accepting a location ID; broad authored-catalogue queries exclude private rows. The global snapshot cache remains public-only, while each user snapshot merges that user's active places.
- Images live in the existing private `together-user-media` bucket under `<user-id>/places/<place-id>/`. The server issues signed upload and view URLs. Once an uploaded JPEG is confirmed, a versioned `location_canonical` media reference lets photo and video generation use the place image without changing character identity references.
- Archiving removes a place from new choices but keeps the row for completed plans and media history. The endpoint rejects archiving while a proposed, scheduled, or active plan still uses it.

## Feature path

1. The picker saves a private place and offers its specific activities. The selected location and activity go through the existing single/group plan validation and attendance path.
2. Active plans and scenes resolve that same ID into the place's description, visual prompt, district ancestry, and image reference. Dialogue and media can therefore recognize the actual setting rather than substituting a generic home.
   An explicit personal location takes precedence over the companion's usual “at home” schedule fallback.
3. The main snapshot includes the owner's place and a short-lived signed image URL. The shared `locationImageSource` resolver prefers the uploaded image for chat backgrounds, scene panels, location details, plans, and Moments, with a storage-path cache key that survives renewed signatures. Saving or replacing a place updates the owner's current snapshot immediately and invalidates older in-flight reads. Explore and public world directories continue showing authored places only.
4. The video location selector includes the owner's private places. The same owner and world checks apply when a location is submitted directly.

## Release checks

- Apply the migration before deploying Edge Functions or the web bundle. Then deploy every changed function that imports a changed shared module.
- Check one-account create/edit/image upload, reload, individual plan, group plan, change plan, chat location recall, photo location reference, and video location selection. Check that a second account cannot read or plan at the first account's place.
- Verify an archived place is absent from new choices while old completed plan details remain readable.
