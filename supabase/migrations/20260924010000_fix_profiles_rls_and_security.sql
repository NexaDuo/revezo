-- Fix function security
REVOKE ALL ON FUNCTION public.sync_last_sign_in_at() FROM PUBLIC, anon;

-- Allow coordinators to update visualizers in their unit
CREATE POLICY profiles_coordenador_update ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.is_coordenador() 
    AND unidade_id = public.minha_unidade() 
    AND role = 'visualizador'
  )
  WITH CHECK (
    public.is_coordenador() 
    AND unidade_id = public.minha_unidade() 
    AND role = 'visualizador'
  );
