import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@analytiq/validation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ErrorState } from '../components/ui/states';
import { useSession } from '../stores/session';
import ngMall from '../assets/login/ng-mall.png';
import ngMarket from '../assets/login/ng-market.png';
import ngPos from '../assets/login/ng-pos.png';
import ngRestaurant from '../assets/login/ng-restaurant.png';

const SLIDES = [
 { src: ngPos, caption: 'Faster checkout on every lane' },
 { src: ngMarket, caption: 'Built for the way Nigeria sells' },
 { src: ngMall, caption: 'From one shop to a whole chain' },
 { src: ngRestaurant, caption: 'Tables, takeaways and everything between' },
];
/** 7s per slide — inside the requested 5000–10000 ms range. */
const SLIDE_INTERVAL_MS = 7000;

export function LoginPage(): JSX.Element {
 const [serverError, setServerError] = useState<string | null>(null);
 const [slideIndex, setSlideIndex] = useState(0);
 const navigate = useNavigate();
 const signIn = useSession((s) => s.signIn);

 useEffect(() => {
 const timer = setInterval(() => {
 setSlideIndex((i) => (i + 1) % SLIDES.length);
 }, SLIDE_INTERVAL_MS);
 return () => clearInterval(timer);
 }, []);

 const form = useForm<LoginInput>({
 resolver: zodResolver(loginSchema),
 defaultValues: { email: '', password: '' },
 });

 const onSubmit = form.handleSubmit(async (values) => {
 setServerError(null);
 const result = await signIn(values.email, values.password);
 if (!result.ok) {
 setServerError(result.error ?? 'Sign in failed');
 return;
 }
 navigate('/', { replace: true });
 });

 return (
 <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-6">
 {/* Full-page background slideshow */}
 <div className="pointer-events-none absolute inset-0 bg-slate-950" aria-hidden>
 {SLIDES.map((slide, i) => (
 <img
 key={slide.src}
 src={slide.src}
 alt=""
 className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-in-out ${
 i === slideIndex ? 'scale-105 opacity-100' : 'scale-100 opacity-0'
 } transition-transform duration-[8000ms]`}
 />
 ))}
 {/* Dual overlay: keeps the sign-in card readable over any slide */}
 <div className="absolute inset-0 bg-slate-950/55" />
 <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/40 to-slate-950/70" />
 <div className="absolute inset-0 bg-gradient-to-t from-brand-950/60 via-transparent to-slate-950/50" />
 </div>

 {/* Brand mark, top-left of the page */}
 <div className="absolute left-8 top-8 z-10 flex items-center gap-3 text-white">
 <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-xl font-black shadow-lg">
 A
 </span>
 <div>
 <p className="text-base font-bold leading-tight tracking-tight">AnalytIQ</p>
 <p className="text-xs text-white/70">Inventory &amp; POS</p>
 </div>
 </div>

 {/* Slide caption + indicators, bottom-left of the page */}
 <div className="absolute bottom-8 left-8 z-10 hidden max-w-md text-white md:block">
 <p key={slideIndex} className="animate-slide-up text-2xl font-bold leading-snug tracking-tight drop-shadow">
 {SLIDES[slideIndex]?.caption}
 </p>
 <div className="mt-4 flex gap-2">
 {SLIDES.map((slide, i) => (
 <button
 key={slide.src}
 type="button"
 aria-label={`Show slide ${i + 1}`}
 onClick={() => setSlideIndex(i)}
 className={`h-1.5 rounded-full transition-all duration-300 ${
 i === slideIndex ? 'w-8 bg-brand-400' : 'w-3 bg-white/40 hover:bg-white/70'
 }`}
 />
 ))}
 </div>
 </div>

 <Card className="relative z-10 w-full max-w-md animate-slide-up overflow-hidden border-white/20 shadow-pop backdrop-blur-xl">
 <CardContent className="bg-white/95 p-8 dark:bg-slate-900/95">
 <div className="mb-6 flex items-center gap-2 md:hidden">
 <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-base font-black text-white">
 A
 </span>
 <p className="font-bold tracking-tight">AnalytIQ</p>
 </div>
 <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
 <p className="mt-1 text-sm text-slate-500">Sign in to open your store.</p>
 {serverError ? (
 <div className="mt-4">
 <ErrorState message={serverError} />
 </div>
 ) : null}
 <form onSubmit={onSubmit} className="mt-5 space-y-4">
 <Input label="Email" type="email" autoComplete="username" {...form.register('email')} error={form.formState.errors.email?.message} />
 <Input label="Password" type="password" autoComplete="current-password" {...form.register('password')} error={form.formState.errors.password?.message} />
 <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
 {form.formState.isSubmitting ? 'Signing in…' : 'Sign in →'}
 </Button>
 </form>
 <p className="mt-6 text-center text-xs text-slate-400">
 Offline-first — your shop keeps running with or without internet.
 </p>
 </CardContent>
 </Card>
 </div>
 );
}
