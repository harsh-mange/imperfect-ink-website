/* Supabase-backed CMS handlers layered onto the existing vanilla UI. */
(function () {
  function initialize() {
  if (window.__impInkSupabaseCmsInitialized) return true;
  const B = window.ImpInkBackend;
  if (!B?.ready) return false;
  window.__impInkSupabaseCmsInitialized = true;
  const c = B.client;
  const q = async promise => { const { data, error } = await promise; if (error) throw error; return data; };
  const slugify = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fail = error => toast(error?.message || 'The change could not be saved.', 'error');
  const refresh = async () => { await B.load(true); if (typeof route === 'function') route(); };
  const imageTypes = /^image\/(jpeg|png|webp|gif)$/i;

  function setBusy(form, busy) {
    form?.querySelectorAll('button[type="submit"],button[data-upload-button]').forEach(button => {
      button.disabled = busy;
      if (button.type === 'submit') button.dataset.originalText ??= button.textContent;
      if (button.type === 'submit') button.textContent = busy ? 'Saving…' : button.dataset.originalText;
    });
  }
  function setUploadState(control, message, error = false) { const status = control.closest('[data-image-control]')?.querySelector('[data-upload-status]') || control.querySelector?.('[data-product-upload-status]') || control.closest('form')?.querySelector('[data-product-upload-status]'); if (status) { status.textContent = message; status.classList.toggle('error', error); } }
  async function upload(file, bucket, prefix, control) {
    if (!file) throw new Error('Choose an image first.');
    if (!imageTypes.test(file.type)) throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MB or smaller.');
    const safeName = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
    const extension = (file.name.match(/\.[^.]+$/)?.[0] || '.jpg').toLowerCase();
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `${prefix}/${id}-${safeName}${extension}`;
    if (control) setUploadState(control, 'Uploading…');
    await q(c.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type }));
    if (control) setUploadState(control, 'Upload complete.');
    return { bucket, path, url: c.storage.from(bucket).getPublicUrl(path).data.publicUrl };
  }
  function imageControl(fieldName, value, ref) { const r = ref || {}; return `<span class="image-upload" data-image-control data-field="${fieldName}"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-upload-input hidden><button type="button" class="btn" data-upload-button>Upload Image</button><button type="button" class="btn" data-remove-image>Remove</button><span class="upload-status" data-upload-status>JPG, PNG, WebP or GIF · max 8 MB</span><img class="image-preview" data-upload-preview src="${esc(value || '')}" alt="Selected image preview" ${value ? '' : 'hidden'} data-storage-path="${esc(r.storagePath || '')}" data-storage-bucket="${esc(r.bucket || '')}"></span>`; }
  function addImageControls() {
    document.querySelectorAll('form').forEach(form => {
      const fields = [...form.elements].filter(field => ['image', 'storyImage', 'processImage', 'contactImage', 'faqImage', 'careImage', 'privacyImage', 'termsImage', 'url'].includes(field.name));
      fields.forEach(field => {
        if (field.dataset.imageEnhanced) return;
        field.dataset.imageEnhanced = '1';
        const ref = field.name === 'image' ? db.content.homepage?.imageRef : db.content.pages?.[`${field.name}Ref`];
        if (ref?.id) field.dataset.mediaId = ref.id;
        const existingWrapper = form.querySelector(`[data-image-control][data-field="${field.name}"]`);
        if (!existingWrapper) field.insertAdjacentHTML('afterend', imageControl(field.name, field.value, ref));
        const wrapper = existingWrapper || field.nextElementSibling, fileInput = wrapper.querySelector('[data-upload-input]'), preview = wrapper.querySelector('[data-upload-preview]');
        if (field.value && !preview.src) preview.src = field.value;
        preview.hidden = !field.value;
        wrapper.querySelector('[data-upload-button]').onclick = () => fileInput.click();
        wrapper.querySelector('[data-remove-image]').onclick = () => { field.value = ''; field.dataset.storagePath = ''; field.dataset.storageBucket = ''; field.dataset.mediaId = ''; preview.hidden = true; preview.removeAttribute('src'); setUploadState(wrapper, 'Image removed.'); };
        field.addEventListener('input', () => { field.dataset.storagePath = ''; field.dataset.storageBucket = ''; field.dataset.mediaId = ''; preview.src = field.value; preview.hidden = !safeUrl(field.value); });
        fileInput.onchange = async () => { try { const result = await upload(fileInput.files[0], 'cms-media', `cms/${slugify(field.name)}`, wrapper); field.value = result.url; field.dataset.storagePath = result.path; field.dataset.storageBucket = result.bucket; field.dataset.mediaId = ''; preview.src = result.url; preview.hidden = false; } catch (error) { setUploadState(wrapper, error.message, true); } finally { fileInput.value = ''; } };
      });
    });
  }
  function bindImageEvents() {
    if (window.__impInkImageEventsBound) return;
    window.__impInkImageEventsBound = true;
    document.addEventListener('click', event => {
      const uploadButton = event.target.closest('[data-upload-button]');
      if (uploadButton) {
        event.preventDefault();
        uploadButton.closest('[data-image-control]')?.querySelector('[data-upload-input]')?.click();
        return;
      }
      const removeButton = event.target.closest('[data-remove-image]');
      if (removeButton) {
        event.preventDefault();
        const wrapper = removeButton.closest('[data-image-control]');
        const field = wrapper?.closest('form')?.elements[wrapper.dataset.field] || wrapper?.previousElementSibling;
        const preview = wrapper?.querySelector('[data-upload-preview]');
        if (field) { field.value = ''; field.dataset.storagePath = ''; field.dataset.storageBucket = ''; field.dataset.mediaId = ''; }
        if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
        if (wrapper) setUploadState(wrapper, 'Image removed.');
      }
    });
    document.addEventListener('change', async event => {
      const input = event.target;
      if (!input.matches('[data-upload-input]')) return;
      const wrapper = input.closest('[data-image-control]');
      const field = wrapper?.closest('form')?.elements[wrapper.dataset.field] || wrapper?.previousElementSibling;
      const preview = wrapper?.querySelector('[data-upload-preview]');
      if (!wrapper || !field || !preview) return;
      try {
        const result = await upload(input.files?.[0], 'cms-media', `cms/${slugify(field.name)}`, wrapper);
        field.value = result.url;
        field.dataset.storagePath = result.path;
        field.dataset.storageBucket = result.bucket;
        field.dataset.mediaId = '';
        preview.src = result.url;
        preview.hidden = false;
      } catch (error) {
        setUploadState(wrapper, error.message, true);
      } finally {
        input.value = '';
      }
    });
  }
  async function saveMediaField(form, fieldName, alt) { const field = form.elements[fieldName]; if (!field?.value.trim()) return null; if (field.dataset.mediaId && !field.dataset.storagePath) return field.dataset.mediaId; const media = await q(c.from('media_assets').insert({ external_url: field.dataset.storagePath ? null : field.value.trim(), storage_path: field.dataset.storagePath ? `${field.dataset.storageBucket}/${field.dataset.storagePath}` : null, alt_text: alt, media_type: 'image' }).select().single()); return media.id; }

  const oldAdmin = window.admin;
  window.admin = function () { return oldAdmin().replace('Studio CMS · Demo mode', 'Studio CMS').replace('Local browser persistence only. Supabase and authentication are not configured.', 'Changes are saved securely to Supabase.').replace('Demo mode: changes save to this browser and immediately drive the public site. This is not cloud persistence.', 'Connected to Supabase.'); };

  window.saveHomepage = async event => { event.preventDefault(); const form = event.currentTarget || event.target; if (!validateForm(form)) return; setBusy(form, true); try { const d = formData(event), heroId = await saveMediaField(form, 'image', 'Homepage hero image'); await q(c.from('homepage_content').upsert({ id: true, headline: d.headline, subheadline: d.subheadline, announcement: d.announcement, hero_media_id: heroId, is_published: true }, { onConflict: 'id' })); await refresh(); toast('Homepage content saved and published.'); } catch (error) { fail(error); } finally { setBusy(form, false); } };

  const pageFields = [['story', 'storyImage', 'Our Story'], ['process', 'processImage', 'Making Process'], ['contact', 'contactImage', 'Contact Concierge'], ['faq', 'faqImage', 'FAQ'], ['care', 'careImage', 'Product Care'], ['privacy', 'privacyImage', 'Privacy Policy'], ['terms', 'termsImage', 'Terms & Conditions']];
  window.savePages = async event => { event.preventDefault(); const form = event.currentTarget || event.target; if (!validateForm(form)) return; setBusy(form, true); try { for (const [slug, imageField, title] of pageFields) { const old = await q(c.from('website_pages').select('id').eq('slug', slug).maybeSingle()), imageId = await saveMediaField(form, imageField, `${title} image`); const payload = { slug, title, body: form.elements[slug]?.value || '', featured_media_id: imageId, is_published: true, sort_order: pageFields.findIndex(item => item[0] === slug) }; if (old?.id) payload.id = old.id; await q(c.from('website_pages').upsert(payload, { onConflict: 'slug' })); } await refresh(); toast('Website pages saved and published.'); } catch (error) { console.error('Supabase page save failed', error); fail(error); } finally { setBusy(form, false); } };

  if (!window.productFields) window.productFields = function (p = {}) { const vt = (p.variations || []).map(v => `${v.name}: ${v.options.map(o => `${o.name}|${o.price || ''}`).join(', ')}`).join('\n'); const images = (p.images || [p.image]).filter(Boolean).join('\n'); return `<label>Name<input required minlength="3" class="input" name="name" value="${esc(p.name)}"></label><label>Base price<input required type="number" min="1" step="1" class="input" name="price" value="${esc(p.price || 0)}"></label><label>Availability<select required class="input" name="availability"><option ${p.availability === 'Available' ? 'selected' : ''}>Available</option><option ${p.availability === 'Made to Order' ? 'selected' : ''}>Made to Order</option><option ${p.availability === 'Sold Out' ? 'selected' : ''}>Sold Out</option><option ${p.availability === 'Draft' ? 'selected' : ''}>Draft</option></select></label><label>Order<input required type="number" min="1" class="input" name="order" value="${esc(p.order || 1)}"></label><label class="full">Product image URLs <span class="muted">(one URL per line; first is the main image)</span><textarea class="input" name="images" rows="5" placeholder="Supabase links will appear here after upload">${esc(images)}</textarea><input class="input" name="imageFiles" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-product-upload><span class="upload-status" data-product-upload-status>JPG, PNG, WebP or GIF · max 8 MB each</span><div data-product-preview></div><button type="button" class="btn" data-clear-product-images>Clear image selection</button></label><label class="full">Description<textarea class="input" name="description" required minlength="20">${esc(p.description || '')}</textarea></label><label class="full"><input type="checkbox" name="startingPrice" ${p.startingPrice ? 'checked' : ''}> Show “Starting from”</label><label class="full">Variations<textarea class="input" name="variations" rows="5" placeholder="Size: Small|2850, Medium|3250">${esc(vt)}</textarea></label>`; };

  async function addProductUploadControls() {
    document.querySelectorAll('form').forEach(form => {
      const input = form.elements.imageFiles;
      if (!input || input.dataset.uploadEnhanced) return;
      input.dataset.uploadEnhanced = '1';
      const status = form.querySelector('[data-product-upload-status]'), preview = form.querySelector('[data-product-preview]'), urls = form.elements.images;
      input.onchange = async () => { try { const results = []; for (const file of Array.from(input.files || [])) results.push(await upload(file, 'product-images', `products/${slugify(form.elements.name?.value || 'product')}`, form)); urls.value = [urls.value.trim(), ...results.map(x => x.url)].filter(Boolean).join('\n'); preview.innerHTML = urls.value.split(/\r?\n/).filter(Boolean).map(url => `<img class="image-preview" src="${esc(url)}" alt="Product image preview">`).join(''); if (status) status.textContent = `${results.length} image${results.length === 1 ? '' : 's'} uploaded. Save the product to apply changes.`; } catch (error) { if (status) { status.textContent = error.message; status.classList.add('error'); } } finally { input.value = ''; } };
      urls.addEventListener('input', () => { preview.innerHTML = urls.value.split(/\r?\n/).filter(Boolean).map(url => `<img class="image-preview" src="${esc(url)}" alt="Product image preview">`).join(''); });
      form.querySelector('[data-clear-product-images]')?.addEventListener('click', () => { urls.value = ''; preview.innerHTML = ''; if (status) status.textContent = 'Image selection cleared. Save the product to apply changes.'; });
    });
  }
  const saveProduct = async (event, existing) => { event.preventDefault(); const form = event.currentTarget || event.target; if (!validateForm(form)) return; setBusy(form, true); const uploaded = []; try { const data = formData(event), product = recordFromForm(data, existing?.id, existing?.slug, existing?.published !== false); for (const file of Array.from(form.elements.imageFiles?.files || [])) uploaded.push(await upload(file, 'product-images', `products/${product.slug}`, form)); product.images = [...(product.images || []), ...uploaded.map(x => x.url)].filter(Boolean); product.image = product.images[0] || ''; const row = await B.saveProduct(product); await q(c.from('product_images').delete().eq('product_id', row.id)); const links = product.images.map((url, index) => { const item = uploaded.find(x => x.url === url); return { product_id: row.id, image_url: url, storage_path: item ? `${item.bucket}/${item.path}` : null, alt_text: product.name, sort_order: index }; }); if (links.length) await q(c.from('product_images').insert(links)); await refresh(); toast('Product saved.'); location.hash = '/admin/products'; route(); } catch (error) { for (const file of uploaded) await c.storage.from(file.bucket).remove([file.path]).catch(() => {}); fail(error); } finally { setBusy(form, false); } };
  window.createProduct = event => saveProduct(event, null);
  window.updateProduct = (event, slug) => saveProduct(event, db.products.find(x => x.slug === decodeURIComponent(slug)));
  window.moveProduct = async (slug, direction) => {
    const ordered = [...db.products].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex(product => product.slug === slug), next = index + Number(direction || 0);
    if (index < 0 || next < 0 || next >= ordered.length) return;
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    const root = document.querySelector('#admin-product-table')?.closest('.admin-main');
    try { setBusy(root, true); await Promise.all(ordered.map((product, position) => q(c.from('products').update({ sort_order: position + 1 }).eq('id', product.id)))); await refresh(); toast('Product order saved.'); } catch (error) { fail(error); } finally { setBusy(root, false); }
  };

  window.createFaq = async event => { event.preventDefault(); const form = event.currentTarget || event.target; if (!validateForm(form) || !validateMinimum(form, { question: 5, answer: 10 })) return; setBusy(form, true); try { const d = formData(event); await q(c.from('faqs').insert({ question: d.question, answer: d.answer, is_published: true, sort_order: db.content.faqs.length })); await refresh(); toast('FAQ saved and published.'); } catch (error) { fail(error); } finally { setBusy(form, false); } };
  window.deleteFaq = async i => { try { const x = db.content.faqs[i]; if (x?.id) await q(c.from('faqs').delete().eq('id', x.id)); await refresh(); } catch (error) { fail(error); } };
  window.createTestimonial = async event => { event.preventDefault(); const form = event.currentTarget || event.target; if (!validateForm(form) || !validateMinimum(form, { name: 2, text: 10 })) return; setBusy(form, true); try { const d = formData(event); await q(c.from('testimonials').insert({ customer_name: d.name, quote: d.text, rating: Number(d.rating), is_published: true, sort_order: db.content.testimonials.length })); await refresh(); toast('Testimonial saved and published.'); } catch (error) { fail(error); } finally { setBusy(form, false); } };
  window.deleteTestimonial = async i => { try { const x = db.content.testimonials[i]; if (x?.id) await q(c.from('testimonials').delete().eq('id', x.id)); await refresh(); } catch (error) { fail(error); } };
  window.saveFaq = async id => { try { await q(c.from('faqs').update({ question: document.querySelector(`#faq-q-${id}`).value, answer: document.querySelector(`#faq-a-${id}`).value, is_published: document.querySelector(`#faq-p-${id}`).checked, sort_order: Number(document.querySelector(`#faq-o-${id}`).value || 0) }).eq('id', id)); await refresh(); toast('FAQ updated.'); } catch (error) { fail(error); } };
  window.saveTestimonial = async id => { try { await q(c.from('testimonials').update({ customer_name: document.querySelector(`#test-n-${id}`).value, quote: document.querySelector(`#test-q-${id}`).value, rating: Number(document.querySelector(`#test-r-${id}`).value), is_published: document.querySelector(`#test-p-${id}`).checked, sort_order: Number(document.querySelector(`#test-o-${id}`).value || 0) }).eq('id', id)); await refresh(); toast('Testimonial updated.'); } catch (error) { fail(error); } };
  window.addMedia = async event => { event.preventDefault(); const form = event.currentTarget || event.target; if (!validateForm(form)) return; setBusy(form, true); try { const d = formData(event), field = form.elements.url; if (!field.dataset.storagePath && !/^https?:\/\//i.test(d.url)) throw new Error('Image URL must start with http:// or https://.'); await q(c.from('media_assets').insert({ external_url: field.dataset.storagePath ? null : d.url, storage_path: field.dataset.storagePath ? `${field.dataset.storageBucket}/${field.dataset.storagePath}` : null, alt_text: d.alt, media_type: 'image' })); await refresh(); toast('Media saved.'); } catch (error) { fail(error); } finally { setBusy(form, false); } };
  window.uploadCmsMedia = async event => { event.preventDefault(); const form = event.currentTarget || event.target; if (!validateForm(form)) return; setBusy(form, true); try { const d = formData(event), result = await upload(form.elements.file.files[0], 'cms-media', 'cms', form); await q(c.from('media_assets').insert({ storage_path: `${result.bucket}/${result.path}`, alt_text: d.alt, media_type: 'image' })); await refresh(); toast('Image uploaded and saved.'); } catch (error) { fail(error); } finally { setBusy(form, false); } };
  window.deleteMedia = async i => { try { const x = db.content.media[i]; if (x?.id) await q(c.from('media_assets').delete().eq('id', x.id)); await refresh(); } catch (error) { fail(error); } };
  window.saveInquiryStatus = async (id, status) => { try { await q(c.from('bespoke_inquiries').update({ status, internal_notes: document.querySelector(`#notes-${id}`)?.value || null }).eq('id', id)); await refresh(); toast('Inquiry updated.'); } catch (error) { fail(error); } };
  window.loadInquiries = async () => { try { const rows = await q(c.from('bespoke_inquiries').select('*').order('created_at', { ascending: false })), element = document.querySelector('#inquiry-list'); if (!element) return; element.innerHTML = rows.length ? rows.map(row => `<article class="card" style="padding:18px;margin-bottom:12px"><b>${esc(row.name)}</b><p class="muted">${esc(row.phone)} · ${new Date(row.created_at).toLocaleString()}</p><p>${esc(row.description)}</p><p class="muted">Size: ${esc(row.preferred_size || '—')} · Colours: ${esc(row.preferred_colours || '—')}</p><textarea class="input" id="notes-${row.id}" rows="2" placeholder="Internal notes">${esc(row.internal_notes || '')}</textarea><br><select class="input" onchange="saveInquiryStatus('${row.id}',this.value)">${['new', 'in_progress', 'completed', 'archived'].map(status => `<option value="${status}" ${row.status === status ? 'selected' : ''}>${status.replace('_', ' ')}</option>`).join('')}</select></article>`).join('') : '<div class="empty">No inquiries yet.</div>'; } catch (error) { const element = document.querySelector('#inquiry-list'); if (element) element.innerHTML = `<div class="empty">${esc(error.message)}</div>`; } };
  window.adminLogout = async () => { try { await B.signOut(); location.hash = '/'; route(); } catch (error) { fail(error); } };

  const oldRoute = route;
  route = function () { const result = oldRoute.apply(this, arguments); setTimeout(() => { addImageControls(); addProductUploadControls(); }, 0); return result; };
  addEventListener('hashchange', () => setTimeout(() => { addImageControls(); addProductUploadControls(); }, 0));
  bindImageEvents();
  addImageControls();
  addProductUploadControls();
  return true;
  }
  if (!initialize()) {
    const retry = setInterval(() => {
      if (initialize()) clearInterval(retry);
    }, 100);
    setTimeout(() => clearInterval(retry), 30000);
  }
})();
