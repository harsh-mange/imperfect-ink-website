/* Supabase client and data-access layer for the static frontend. */
(function () {
  const config = window.IMP_INK_SUPABASE || {};
  if (!window.supabase || !config.url || !config.publishableKey) {
    window.ImpInkBackend = { ready: false, configured: Boolean(config.url && config.publishableKey), error: new Error(!window.supabase && config.url ? 'The Supabase client library did not load. Check the browser network/CDN access.' : 'Supabase configuration is missing.') };
    return;
  }
  const client = window.supabase.createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const q = async (promise, label='Supabase request') => { let timer; try { const result=await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out. Check the Supabase URL, network connection, or RLS policy.`)),15000)})]); const { data, error }=result; if(error) throw error; return data; } finally { clearTimeout(timer); } };
  const mapProduct = p => { const images=(p.product_images||[]).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)); return { id:p.id, slug:p.slug, name:p.name, price:Number(p.base_price||0), availability:String(p.availability||'available').replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase()), order:Number(p.sort_order||0), image:images[0]?.image_url || '', images:images.map(x=>x.image_url).filter(Boolean), description:p.description||'', published:p.is_published===true, featured:p.is_featured===true, deletedAt:p.deleted_at, createdAt:p.created_at, updatedAt:p.updated_at, startingPrice:p.pricing_mode==='starting_from', variations:(p.product_variations||[]).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(v=>({ name:v.name, pricing:p.pricing_mode==='different_options'?'different':'starting', options:(v.product_variation_options||[]).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(o=>({name:o.name,price:o.price==null?Number(p.base_price||0):Number(o.price)})) })) }; };
  async function load(includeUnpublished=false) {
    let productQuery=client.from('products').select('*,product_images(*),product_variations(*,product_variation_options(*))').is('deleted_at', null);
    if(!includeUnpublished) productQuery=productQuery.eq('is_published', true);
    const rows = await q(productQuery.order('sort_order'));
    const mappedProducts = rows.map(mapProduct);
    // Publish products immediately; optional CMS content must never block the catalogue.
    window.db = window.db || {};
    window.db.products = mappedProducts;
    const optional = async (promise, fallback, label) => { try { return await q(promise); } catch (error) { console.error(`Supabase ${label} load failed`, {message:error?.message, details:error?.details, hint:error?.hint, code:error?.code}); return fallback; } };
    const [settings, home, pages, faqs, testimonials, media] = await Promise.all([
      optional(client.from('site_settings').select('*').maybeSingle(), null, 'settings'),
      optional(client.from('homepage_content').select('*,hero:hero_media_id(*),story:story_media_id(*)').maybeSingle(), null, 'homepage'),
      optional(client.from('website_pages').select('*,featured:featured_media_id(*)').order('sort_order'), [], 'pages'),
      optional(client.from('faqs').select('*').order('sort_order'), [], 'faqs'),
      optional(client.from('testimonials').select('*').order('sort_order'), [], 'testimonials'),
      optional(client.from('media_assets').select('*').order('created_at',{ascending:false}), [], 'media')
    ]);
    const page = slug => pages.find(x=>x.slug===slug)||{}; const url = m => m?.external_url || (m?.storage_path ? client.storage.from(m.storage_path.split('/')[0]).getPublicUrl(m.storage_path.split('/').slice(1).join('/')).data.publicUrl : '');
    window.db = { settings:{brand:settings?.brand_name||'Imperfect Ink by Shilpa',whatsapp:settings?.whatsapp||'',email:settings?.email||'',instagram:settings?.instagram_url||''}, products:mappedProducts, content:{homepage:{headline:home?.headline||'',subheadline:home?.subheadline||'',announcement:home?.announcement||'',image:url(home?.hero)},pages:{story:page('story').body||'',storyImage:url(page('story').featured),process:page('process').body||'',processImage:url(page('process').featured),contact:page('contact').body||'',contactImage:url(page('contact').featured),faqImage:url(page('faq').featured),careImage:url(page('care').featured),privacyImage:url(page('privacy').featured),termsImage:url(page('terms').featured)},faqs:faqs.map(x=>({id:x.id,question:x.question,answer:x.answer})),testimonials:testimonials.map(x=>({id:x.id,name:x.customer_name,rating:x.rating,text:x.quote,published:x.is_published})),media:media.map(x=>({id:x.id,url:url(x),alt:x.alt_text}))} };
    return window.db;
  }
  async function admin() { const {session}=await q(client.auth.getSession(),'Admin session lookup'); const user=session?.user; if(!user) return null; const profile=await q(client.from('admin_profiles').select('role,display_name').eq('user_id',user.id).maybeSingle(),'Admin profile lookup'); return profile?{user,profile}:null; }
  window.ImpInkBackend={ready:true,client,load,admin,signIn:(email,password)=>q(client.auth.signInWithPassword({email,password})),signOut:()=>q(client.auth.signOut()),insertInquiry:d=>q(client.from('bespoke_inquiries').insert({name:d.name,phone:d.phone,preferred_size:d.size,preferred_colours:d.colours,description:d.description,notes:d.notes}).select().single()),
    saveProduct:async(p)=>{const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; const payload={slug:p.slug,name:p.name,description:p.description,base_price:p.price,pricing_mode:p.startingPrice?'starting_from':(p.variations||[]).some(v=>v.pricing==='different')?'different_options':'fixed',availability:p.availability.toLowerCase().replaceAll(' ','_'),sort_order:p.order,is_published:p.published!==false}; if(uuid.test(String(p.id||''))) payload.id=p.id; const row=await q(client.from('products').upsert(payload,{onConflict:'slug'}).select().single()); await q(client.from('product_variations').delete().eq('product_id',row.id)); for(let i=0;i<(p.variations||[]).length;i++){const v=await q(client.from('product_variations').insert({product_id:row.id,name:p.variations[i].name,sort_order:i}).select().single()); const options=(p.variations[i].options||[]).map((o,j)=>({variation_id:v.id,name:o.name,price:o.price,sort_order:j})); if(options.length) await q(client.from('product_variation_options').insert(options));} return row;},
    deleteProduct:id=>q(client.from('products').update({deleted_at:new Date().toISOString(),is_published:false}).eq('id',id)),
    setProductPublished:(id,value)=>q(client.from('products').update({is_published:value}).eq('id',id)),
    updateSettings:d=>q(client.from('site_settings').upsert({id:true,brand_name:d.brand,whatsapp:d.whatsapp,email:d.email,instagram_url:d.instagram}).select().single()),
    async loginMarkup(){return '<main class="wrap page-top" style="max-width:520px"><div class="eyebrow">Supabase studio access</div><h1 class="product h1">Admin login</h1><div class="notice">Connected to Supabase. Sign in with an authorized admin account to open the CMS. Demo mode is disabled.</div><form onsubmit="adminLogin(event)" class="form-grid"><label class="full">Email<input class="input" name="email" type="email" required autocomplete="email"></label><label class="full">Password<input class="input" name="password" type="password" required autocomplete="current-password"></label><div class="full"><button class="btn primary">Sign in</button></div></form></main>';}
  };
})();

// Keep catalogue order numbers unique when products are created or edited.
(function () {
  const backend = window.ImpInkBackend;
  if (!backend?.ready || !backend.saveProduct) return;
  const originalSaveProduct = backend.saveProduct;
  backend.saveProduct = async product => {
    const { data: rows, error } = await backend.client
      .from('products').select('id,sort_order').is('deleted_at', null).order('sort_order');
    if (error) throw error;
    const currentId = String(product.id || '');
    const others = (rows || []).filter(row => String(row.id) !== currentId);
    const requested = Math.max(1, Number(product.order) || others.length + 1);
    const position = Math.min(requested, others.length + 1) - 1;
    const ordered = [...others];
    ordered.splice(position, 0, { id: currentId, sort_order: product.order });
    product.order = position + 1;
    const result = await originalSaveProduct(product);
    const updates = ordered
      .filter((row, index) => row.id && String(row.id) !== currentId && Number(row.sort_order) !== index + 1)
      .map(row => backend.client.from('products').update({ sort_order: ordered.indexOf(row) + 1 }).eq('id', row.id));
    if (updates.length) {
      const results = await Promise.all(updates);
      const failed = results.find(item => item.error);
      if (failed?.error) throw failed.error;
    }
    return result;
  };
})();
