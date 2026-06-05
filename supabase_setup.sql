-- Passo 1: Criar tabela principal
CREATE TABLE artes_processadas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metodo TEXT CHECK (metodo IN ('DTF', 'Silk-Vetor', 'Silk-Reticula')) NOT NULL,
  status TEXT CHECK (status IN ('Pendente', 'Processando', 'Concluido', 'Erro', 'Revisao_Manual')) DEFAULT 'Pendente',
  prazo_entrega DATE NOT NULL,
  url_original TEXT,
  url_final TEXT,
  erro_mensagem TEXT,
  score_confianca FLOAT,
  nome_arquivo TEXT,
  num_cores INTEGER DEFAULT 4,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Passo 2: Trigger para atualizar atualizado_em automaticamente
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizado_em
BEFORE UPDATE ON artes_processadas
FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- Passo 3: Habilitar RLS (Row Level Security) — ajuste policies conforme necessário
ALTER TABLE artes_processadas ENABLE ROW LEVEL SECURITY;

-- Policy permissiva para anon (ajuste para produção com auth)
CREATE POLICY "Acesso total anon" ON artes_processadas
  FOR ALL USING (true) WITH CHECK (true);

-- Passo 4: Buckets — rodar no Supabase Dashboard > Storage > New Bucket
-- bucket-entrada  (Public: true)
-- bucket-saida    (Public: true)
