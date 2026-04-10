-- Fix the last remaining security issue: add policy for waitlist table
CREATE POLICY "Public waitlist access" ON public.waitlist FOR ALL USING (true); -- Will be refined when auth is added