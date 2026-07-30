# Add Server Data and a Mutation

Create a managed query for the read path and an action for the write path. Give the query a deterministic input and tags. In the action, apply an optimistic update only when rollback is defined, then invalidate or refresh the affected query.

Move authorization and persistence into a server action, endpoint, or registered server form. Validate input again at that boundary.
