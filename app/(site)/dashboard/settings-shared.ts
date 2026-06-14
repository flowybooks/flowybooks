export type ActionState = {
  error?: string;
  success?: string;
};

export const fetcher = (url: string) => fetch(url).then((res) => res.json());
