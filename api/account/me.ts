export default function handler(_req: any, res: any) {
  res.status(200).json({
    authenticated: false,
    credits: 999,
    billingEnabled: false,
    accountsEnabled: false,
    anonymousGeneration: true,
    costs: { image: 1, video: 5 },
  });
}
