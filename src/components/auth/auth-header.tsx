/**
 * Título e subtítulo das telas de entrada. Uma mensagem de erro ocupa o lugar do
 * subtítulo, então a altura do bloco não muda e tudo continua encaixado.
 */
export function AuthHeader({ title, subtitle, error }: { title: string; subtitle: string; error?: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className={error ? "auth-sub auth-sub-error" : "auth-sub"} role={error ? "alert" : undefined}>
        {error ?? subtitle}
      </p>
    </>
  );
}
