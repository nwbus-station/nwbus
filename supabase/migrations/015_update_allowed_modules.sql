-- Function to update allowed_modules for a user (bypasses RLS)
CREATE OR REPLACE FUNCTION update_user_modules(p_user_id UUID, p_modules TEXT[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users SET allowed_modules = p_modules WHERE id = p_user_id;
END;
$$;

-- Grant execute to authenticated users (admin-only check is in the app)
GRANT EXECUTE ON FUNCTION update_user_modules(UUID, TEXT[]) TO authenticated;
