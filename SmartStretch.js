// Standalone PixInsight script. Rename SmartStretch.txt to SmartStretch.js before running.
/* Suite native zoom 1.0:. Fit / 1:1; original-resolution tiles at 50%+. */
// Project the FINAL spatial mask into brightness coordinates. Fractional mask
// weights count proportionally; lasso, Smart Mask and inverse edits are included.
function STLCProject(signalImage,mask,n){
   var total=new Float64Array(n),selected=new Float64Array(n);
   for(var y=0;y<signalImage.height;y++)for(var x=0;x<signalImage.width;x++){
      var v=signalImage.sample(x,y,0),weight=mask.sample(x,y,0);
      if(!isFinite(v)||!isFinite(weight))continue;
      var bin=Math.min(n-1,Math.max(0,Math.floor(v*n)));
      total[bin]++;selected[bin]+=Math.max(0,Math.min(1,weight));
   }return {total:total,selected:selected};
}
function STLCDensityAt(d,v){
   if(!d||!d.total.length||v<0||v>1)return 0;
   var n=d.total.length,b=v*n-.5,i=Math.floor(b),t=b-i;
   function smooth(a,k){k=Math.max(0,Math.min(n-1,k));return .25*a[Math.max(0,k-1)]+.5*a[k]+.25*a[Math.min(n-1,k+1)];}
   var all=smooth(d.total,i)*(1-t)+smooth(d.total,i+1)*t;
   var selected=smooth(d.selected,i)*(1-t)+smooth(d.selected,i+1)*t;
   return all>0?Math.max(0,Math.min(1,selected/all)):0;
}

/* Low Contrast selection 1.0: noise-aware relative local contrast.
 * Operates on the current reduced baseline. Its soft mask follows the same
 * preview-to-full-resolution mapping as the existing spatial selections.
 */
function STLCQuantile(a,p){
   if(!a.length)return 0;var b=a.slice(0);b.sort(function(x,y){return x-y;});
   return b[Math.min(b.length-1,Math.max(0,Math.round(p*(b.length-1))))];
}
function STLCSmooth(a,b,x){var t=Math.max(0,Math.min(1,(x-a)/Math.max(1e-20,b-a)));return t*t*(3-2*t);}
function STLCBox(a,w,h,r){
   var stride=w+1,sum=new Float64Array(stride*(h+1)),out=new Float32Array(w*h);
   for(var y=0;y<h;y++){var row=0;for(var x=0;x<w;x++){row+=a[y*w+x];sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+row;}}
   for(y=0;y<h;y++)for(x=0;x<w;x++){
      var x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);
      out[y*w+x]=(sum[y1*stride+x1]-sum[y0*stride+x1]-sum[y1*stride+x0]+sum[y0*stride+x0])/((x1-x0)*(y1-y0));
   }return out;
}
function STLCBuild(image,sensitivity,scalePercent){
   var w=image.width,h=image.height,n=w*h,C=Math.min(3,image.numberOfChannels);
   var r=Math.max(1,Math.round(Math.min(w,h)*Math.max(.2,Math.min(15,scalePercent))/100));
   var lum=new Float32Array(n),contrast=new Float32Array(n),samples=[],step=Math.max(1,Math.ceil(n/25000));
   for(var c=0;c<C;c++){
      var a=new Float32Array(n),sq=new Float32Array(n),diff=[];
      for(var y=0;y<h;y++)for(var x=0;x<w;x++){
         var i=y*w+x,v=image.sample(x,y,c);if(!isFinite(v))v=0;
         a[i]=v;sq[i]=v*v;lum[i]+=v*(C<3?1:c==0?.2126:c==1?.7152:.0722);
         if(i%step==0&&x+1<w)diff.push(Math.abs(v-image.sample(x+1,y,c)));
      }
      var mean=STLCBox(a,w,h,r),meanSq=STLCBox(sq,w,h,r),noise=STLCQuantile(diff,.5)/.953872;
      var sampleA=[];for(i=0;i<n;i+=step)sampleA.push(a[i]);
      var span=Math.max(1e-12,STLCQuantile(sampleA,.99)-STLCQuantile(sampleA,.1));
      for(i=0;i<n;i++){
         var sigma=Math.sqrt(Math.max(0,meanSq[i]-mean[i]*mean[i]-noise*noise));
         contrast[i]=Math.max(contrast[i],sigma/Math.max(Math.abs(mean[i]),4*noise,.003*span,1e-12));
      }
   }
   var local=STLCBox(lum,w,h,r),d=[];
   for(i=0;i<n;i+=step){samples.push(local[i]);if(i%w+1<w)d.push(Math.abs(lum[i]-lum[i+1]));}
   var bg=STLCQuantile(samples,.15),top=STLCQuantile(samples,.99),spanY=Math.max(1e-12,top-bg);
   var noiseY=STLCQuantile(d,.5)/.953872,gates=new Float32Array(n),eligible=[];
   for(i=0;i<n;i++){
      gates[i]=STLCSmooth(bg+.5*noiseY,bg+3*noiseY+.002*spanY,local[i])*(1-STLCSmooth(bg+.9*spanY,bg+spanY,local[i]));
      if(i%step==0&&gates[i]>.1)eligible.push(contrast[i]);
   }
   var s=Math.max(0,Math.min(1,sensitivity/100)),lo=Math.max(.002,STLCQuantile(eligible,.15+.4*s));
   var hi=Math.max(lo+.005,STLCQuantile(eligible,.45+.4*s)),weights=new Float32Array(n);
   for(i=0;i<n;i++)weights[i]=gates[i]*(1-STLCSmooth(lo,hi,contrast[i]));
   weights=STLCBox(weights,w,h,Math.max(1,Math.round(r/4)));
   var selected=0;for(i=0;i<n;i++){weights[i]=Math.max(0,Math.min(1,weights[i]*gates[i]));if(weights[i]>.1)selected++;}
   return {weights:weights,width:w,height:h,selectedFraction:n?selected/n:0,radius:r};
}

/* Screen-fit layout update 1.0.1. */
#include <pjsr/ColorSpace.jsh>
#include <pjsr/SampleType.jsh>
// Connected faint-color selection. Shared implementation embedded in suite scripts.
function SCCSmooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
function SCCGrow(planes,W,H,regions,reach){
 var N=W*H,out=new Float32Array(N);reach=Math.max(0,Math.min(1,reach));if(reach<=0||planes.length<3)return out;
 var sums=new Float32Array(N),lum=new Float32Array(N),samples=[];
 for(var i=0;i<N;i++){sums[i]=Math.max(0,planes[0][i])+Math.max(0,planes[1][i])+Math.max(0,planes[2][i]);lum[i]=.2126*planes[0][i]+.7152*planes[1][i]+.0722*planes[2][i];if(i%13==0&&isFinite(lum[i]))samples.push(lum[i]);}
 samples.sort(function(a,b){return a-b;});var floor=Math.max(1e-10,samples.length?samples[Math.floor(samples.length*.15)]:0),maxSteps=Math.max(1,Math.round(Math.min(W,H)*.15*reach));
 for(var qn=0;qn<regions.length;qn++){
  var q=regions[qn];if(q.mode!="color"&&q.type!="color")continue;
  var sum=q.r+q.g+q.b;if(sum<=1e-10)continue;
  var cr=q.r/sum,cg=q.g/sum,cb=q.b/sum,seedLum=.2126*q.r+.7152*q.g+.0722*q.b,chroma=Math.sqrt(Math.pow(cr-1/3,2)+Math.pow(cg-1/3,2)+Math.pow(cb-1/3,2));
  if(chroma<.025)continue; // Gray selections cannot define a reliable color direction.
  var tol=Math.max(.001,q.tolerance),loose=tol*(1+2*reach),candidate=new Float32Array(N),dist=new Int32Array(N),queue=new Int32Array(N),head=0,tail=0;
  for(var i=0;i<N;i++){
   dist[i]=-1;if(sums[i]<=1e-10||!isFinite(sums[i]))continue;
   var r=planes[0][i]/sums[i],g=planes[1][i]/sums[i],b=planes[2][i]/sums[i],d=Math.sqrt(Math.pow(r-cr,2)+Math.pow(g-cg,2)+Math.pow(b-cb,2));
   var strict=SCCSmooth((tol-d)/tol);
   if(strict>=.25){candidate[i]=1;if(!q.seedMask||q.seedMask[i]>0){dist[i]=0;queue[tail++]=i;}continue;}
   var c=Math.sqrt(Math.pow(r-1/3,2)+Math.pow(g-1/3,2)+Math.pow(b-1/3,2));
   var direction=(r-1/3)*(cr-1/3)+(g-1/3)*(cg-1/3)+(b-1/3)*(cb-1/3);
   if(lum[i]<=floor||lum[i]>seedLum||c<Math.max(.015,.15*chroma)||direction<=0||d>=loose)continue;
   candidate[i]=SCCSmooth((loose-d)/loose)*Math.min(1,(lum[i]-floor)/Math.max(1e-10,floor));
  }
  while(head<tail){var p=queue[head++],steps=dist[p];if(steps>=maxSteps)continue;var x=p%W,y=Math.floor(p/W);
   for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){if((dx==0&&dy==0)||x+dx<0||x+dx>=W||y+dy<0||y+dy>=H)continue;var n=p+dy*W+dx;if(dist[n]>=0||candidate[n]<=.01)continue;dist[n]=steps+1;queue[tail++]=n;}
  }
  for(var i=0;i<N;i++)if(dist[i]>0){var fade=SCCSmooth(1-dist[i]/(maxSteps+1));out[i]=Math.max(out[i],candidate[i]*fade);}
 }
 return out;
}
function SCCBuild(source,regions,reach){
 var im=new Image(source);try{var scale=Math.min(1,800/im.width,800/im.height);if(scale<1)im.resample(scale);var planes=[];for(var c=0;c<3&&c<im.numberOfNominalChannels;c++){var p=new Float32Array(im.width*im.height);im.getSamples(p,new Rect(0,0,im.width,im.height),c);planes.push(p);}return {width:im.width,height:im.height,weights:SCCGrow(planes,im.width,im.height,regions,reach)};}finally{im.free();}
}
function SCCSample(grid,x,y,W,H){if(!grid)return 0;var gx=Math.max(0,Math.min(grid.width-1,Math.floor((x+.5)*grid.width/W))),gy=Math.max(0,Math.min(grid.height-1,Math.floor((y+.5)*grid.height/H)));return grid.weights[gy*grid.width+gx];}
/* 0.5.35.5: Native bottom-left instance triangle and Apply square; reusable script settings. */
/* 2026-10-17: Color Tolerance starts and resets at 0.100; saved values remain respected. */
/* Hover-help update 2026-10-16. Processing algorithms and defaults retained. */
// Hover help only: helpers return their inputs and do not change processing settings.
var STHoverCaptions={"Auto": "Detect the target type automatically from image structure.", "Nebula": "Tune automatic mask detection for extended nebulosity.", "Galaxy": "Tune automatic mask detection for galaxy structure.", "Detection Sensitivity": "Higher values include weaker detected structure. Release the slider to rebuild the mask.", "Include Faint Wisps": "Include more faint structure connected to the detected object. Higher values may also include more background.", "Suppress stars during detection": "Reduce the influence of stars when identifying extended astronomical structures.", "Keep Inside": "Keep the existing mask inside the next lasso outline and remove it outside. Completed outlines accumulate.", "Subtract": "Remove the area inside the next lasso outline from the existing mask. Completed outlines accumulate.", "Clear Lasso Edits": "Remove all accumulated lasso edits and restore the underlying generated mask.", "Reset": "Restore the dialog controls to their starting values.", "Cancel": "Close this dialog without accepting its result, or stop the current operation when used in a progress window.", "Create Mask": "Create the mask from the current detection settings and lasso edits at the source image resolution.", "Zoom To Peak": "Zoom the histogram to its meaningful occupied signal range. This does not change image pixels or selection values.", "Center on SP": "Pan the histogram to the selected symmetry point while keeping the current zoom level.", "Reset Zoom": "Show the full histogram signal range from 0 to 1.", "Commit Symmetry Point": "Activate the selected SP for subsequent stretch previews. Selecting an SP alone does not commit it.", "RGB/K": "Use combined RGB brightness, or intensity for a monochrome image.", "R": "Use the red channel for histogram measurements and adjustments.", "G": "Use the green channel for histogram measurements and adjustments.", "B": "Use the blue channel for histogram measurements and adjustments.", "Low": "Lower signal boundary of the current selection. Values use the original normalized 0–1 signal scale.", "High": "Upper signal boundary of the current selection. Values use the original normalized 0–1 signal scale.", "Click range": "Half-width around the picked signal value. Larger values include a wider brightness range.", "Selection Mask": "Show or hide the magenta mask overlay. Hiding it does not turn off the processing mask.", "Inverse Selection": "Reverse the final mask, including lasso edits: selected pixels become protected and protected pixels become selected.", "Mask overlay strength": "Opacity of the magenta mask display. Changes the overlay only, not processing strength.", "Adaptive Symmetry-Stretch (AS)": "Stretch around a committed symmetry point. Click the image or histogram to choose an SP, then commit it.", "Signal": "Select pixels by brightness. Ctrl-click adds or removes ranges; Alt-click selects connected structure when supported.", "Color": "Select pixels with colors similar to the picked color. The histogram is locked while color selection is active.", "Color Tolerance": "Higher values include a wider range of colors around the picked color.", "Lasso": "Enable drawing mask-edit outlines on the preview. Use Keep Inside or Subtract to choose how each outline changes the mask.", "Smart Mask…": "Open automatic nebula/galaxy mask detection and refine its result with lasso edits.", "Intensity": "Raise or lower brightness within the active mask. This is separate from Stretch Factor and local-detail Contrast.", "Contrast": "Increase or reduce local detail contrast within the active mask.", "Stretch Factor": "Strength of the nonlinear stretch. Zero leaves the stretch contribution unchanged. Other adjustments remain independent.", "Local Intensity": "Choose the tonal neighborhood where the stretch is most influential. Midpoint 0.5 retains the established curve weighting.", "Protect Shadows": "Reduce adjustment strength in the darkest pixels. Higher values preserve more deep-shadow signal.", "Protect Highlights": "Reduce adjustment strength in the brightest pixels. Higher values protect bright cores and star highlights.", "Adaptive Boundary": "Limit local tonal changes near sensitive boundaries to reduce artifacts. Higher values increase boundary protection.", "Enable Reference-Aware HDR": "Use the original image as a reference to compress bright regions while retaining surrounding detail.", "HDR Strength": "How strongly the HDR pass compresses bright regions. Only used when Reference-Aware HDR is enabled.", "HDR Scale": "Spatial scale of detail used by the HDR pass. Only used when Reference-Aware HDR is enabled.", "Show Before": "Compare the original preview baseline with the current adjusted preview. Does not change saved settings.", "Update Stretch Preview": "Recalculate the reduced-resolution preview using the current adjustments without applying them to the source image.", "Quick Stretch": "Choose an automatic starting stretch, then refine its strength and finishing options.", "Auto Color & Brightness": "Toggle the optional color and brightness finishing pass.", "Auto High Contrast": "Apply automatic tonal-contrast finishing after the initial stretch.", "Additional Auto High Contrast": "Add another automatic contrast finishing pass to the starting recipe.", "Reset Stretch": "Reset stretch-related adjustments while retaining the current image baseline.", "Refresh Active View": "Reload the active PixInsight image and rebuild the working preview. Clears the previous adjustment history.", "Close": "Close this window. Previously created images are retained.", "Undo": "Restore the previous saved adjustment state.", "Redo": "Restore the next adjustment state after Undo.", "Analyze / Suggest": "Analyze image statistics and suggest settings for shadow clipping and tonal protection.", "Use dirty Apply (experimental)": "Apply only the affected image tiles when the operation is eligible; otherwise use the full-image processing path.", "Verify dirty Apply against full reference (slow)": "Compare experimental dirty Apply against a full-image reference. Adds processing time.", "Reanalyze palette": "Rebuild the Image Analysis starting preview for the selected channel palette.", "Open in QuickStretch": "Open the selected starting image and recipe in the Quick Stretch adjustment dialog.", "Linear black / white": "Apply linear endpoint adjustments to set the black and white levels of the initial stretch.", "Gentle shadow lift — brighter faint detail": "Add a gentle shadow lift to reveal faint structure in the selected starting recipe.", "Faint Nebulosity (experimental second pass)": "Apply an additional guided pass to reveal faint extended nebulosity.", "Faint Nebulosity Strength": "Strength of the optional faint-nebulosity pass. Higher values produce a stronger faint-signal lift.", "Auto Color & Brightness (experimental)": "Enable optional automatic brightness and color enhancement after stretching.", "Brightness Strength": "Amount of automatic brightness enhancement in the optional finishing pass.", "Vibrance Strength": "Amount of automatic color enhancement in the optional finishing pass.", "OK": "Accept the current settings and continue with the result.", "Continue": "Use the selected image and continue to the next dialog.", "Linked RGB correction": "Use linked RGB correction to keep channel corrections coordinated and reduce unintended color shifts.", "Exclude target from background measurement": "Exclude protected astronomical structures from the samples used to fit the background model.", "Also leave target pixels uncorrected": "Leave protected target pixels unchanged instead of interpolating correction beneath them.", "Show original (same display stretch)": "Compare the frozen original with the corrected preview using the same display stretch.", "Display stretch": "Apply a temporary stretch for preview visibility. Does not permanently stretch the corrected output.", "Show estimated fog/cloud mask": "Show the estimated diffuse-background excess as a colored overlay. It is a diagnostic estimate, not a direct measurement of atmospheric cloud.", "Fog mask sensitivity": "Higher values reveal weaker estimated background excess in the overlay. Does not change correction strength.", "Show target protection mask (yellow)": "Show or hide the target-protection overlay. Hiding it does not disable protection.", "Intensity (%)": "Strength of the fitted background correction. 0 leaves the image unchanged; 100 uses the full fitted correction.", "Load / freeze source": "Capture the selected linear source as the baseline for fitting and preview comparisons.", "Load source": "Capture the selected source as the baseline for correction.", "Load selected image": "Freeze the selected linear source as the baseline for gradient fitting and preview comparisons.", "Refresh references": "Refresh the list of open background-reference images and previews.", "Cancel correction": "Request cancellation of the current correction operation.", "Re-detect target mask": "Rebuild automatic target protection from the frozen source. Review and refine the new mask before correcting.", "Build gradient map / preview": "Fit the background model and prepare the corrected preview from the current samples, reference and masks.", "Create corrected image": "Create a separate full-resolution corrected image using the current model and Intensity setting.", "Save gradient JSON": "Save correction settings, measurements and diagnostic information as JSON for review or feedback.", "Start / resume": "Analyze the selected image and start training, or resume its saved session.", "Blind labels": "Hide recipe identities while comparing candidate images to reduce selection bias.", "Choose selected": "Record your selected candidate and advance one training step.", "None acceptable": "Skip an initial group without choosing a winner, or retain the current parent during refinement.", "Inspect selected": "Open an enlarged preview of the selected candidate for closer comparison.", "Explain choice": "Show the recommendation reasoning and available information for the current candidate.", "Restart Phase 2": "Keep the initial group winners and begin a new refinement session.", "Create native-size image": "Render the selected final recipe at the original source resolution as a new image.", "Load preference JSON": "Load previous preferences before starting a new training session.", "Save progress / preferences": "Save training progress, selections, comments and learned preference information as JSON.", "Send Training Data to Don": "Export the training JSON and open the upload page. Complete the file selection and upload in your browser.", "Correct Magenta Stars": "Apply selective magenta-star correction to the working copy. Source pixels remain unchanged.", "Refresh Preview": "Rebuild the preview from the current controls.", "Create Stretched Image": "Create a new full-resolution stretched star image. Leaves the original source unchanged.", "Reset to Original": "Reload the original star image and reset the working adjustments.", "Stretch Strength": "How strongly the stellar brightness distribution is stretched. Higher values reveal more faint stars.", "Color Preservation": "Amount of original star color retained during stretching.", "Star Saturation": "Star-color saturation multiplier. 1 retains the baseline saturation; lower values mute color and higher values intensify it.", "Highlight Protection": "Reduce excessive brightening of star highlights during stretching.", "Background Suppression": "Suppress residual dark background around the stars. Excessive values can remove faint stellar signal.", "Magenta Correction": "Strength of the selective reduction of unwanted magenta star color.", "+": "Zoom in on the image preview. Mouse wheel up also zooms in.", "−": "Zoom out of the image preview, down to fit-to-window. Mouse wheel down also zooms out."};
function STHoverExplain(text){var key=String(text).replace(/:+\s*$/,"").trim();
   if(STHoverCaptions[key])return STHoverCaptions[key];
   if(/^Select /.test(key)||/^Candidate /.test(key))return "Select this candidate preview. Use the confirmation control to continue with your choice.";
   if(/^Stretch Aggressiveness/.test(key))return "Choose how gentle or strong the initial stretch will be.";
   if(/^Remove Color/.test(key))return "Remove the optional color and brightness finishing pass.";
   return "";}
function STHoverAttach(control,text){if(text&&!control.toolTip)control.toolTip=text;return control;}
function STHoverNumericText(control,text,kind){if(kind===2)control.slider.toolTip=text;control.edit.toolTip=text;control.label.toolTip=text;return text;}
function STHoverCaption(control,text,kind){var help=control.toolTip||STHoverExplain(text);if(help){control.toolTip=help;if(kind)STHoverNumericText(control,help,kind);}return text;}

/* 0.5.35.1: Histogram bounds and soft shading follow active stretch focus.
 * White lines show affected bounds; yellow line remains the picked center/SP. */
/* Stretch footprint overlay follows Left/Center/Right in SP and Signal modes;
 * processing mask remains independent to avoid double-applying focus. */
/* 0.5.35.0: Left/Center/Right focus also applies to Signal selection stretches.
 * Signal pivots follow picked centers (closest relative to range width for overlap).
 * Preview, reference and full-resolution paths share the same taper. */
/* 0.5.34.1: Preview SP picks pan the histogram to the picked signal,
 * preserving histogram zoom and the manual Commit Symmetry Point workflow. */
/* 0.5.34.0 — Left / Center / Right stretch focus in SP mode.
 * Center preserves the existing curve exactly. Left affects only values below
 * SP; Right only above SP. A smoothstep taper across 5% of the selected side
 * makes the curve meet the unchanged side with identity slope at SP.
 * Preview, native Apply, LUTs, reference validation, history/instances and reset
 * use the same focus. Intensity/Contrast/HDR remain independent adjustments.
 * PixInsight runtime/UI testing required.
 */
/* Preview zoom: +/− buttons, scrollbars, matching mask/lasso/pick coordinates.
 * Display-only zoom from fit to 16x; requires PixInsight UI testing. */
/* 0.5.31.1: trainer embedding guard and identity-start Quick winner mode. Ordinary Quick defaults and equations unchanged. */
/* 0.5.31.0 — Optional Auto Color & Brightness final postprocessing.
 * Default OFF; brightness 0.35, vibrance 0.25. Existing Quick STF, endpoints,
 * Faint Nebulosity and Auto High Contrast processing equations are unchanged.
 * Median-derived protected midtone lift followed by gamut-limited vibrance
 * preserving Rec.709 luminance after the lift. Preview/native/JS Apply,
 * history/reset and main toggle included. Native runtime testing required.
 */
/* 0.5.30.0 — Experimental optional Faint Nebulosity second pass.
 * Quick chooser default OFF, strength 0.35. Pipeline: STF -> optional linked
 * endpoints -> original-source connected structure lift -> Auto High Contrast.
 * Uses existing SmartMaskEngine (adaptive nebula, sensitivity .65, wisps .70,
 * star suppression). Shared RGB gain protects shadows/highlights and is <=2.
 * Preview, native Apply, JS fallback, history and source reset all wired.
 * Requires visual/native PixInsight testing; does not recover clipped signal.
 */
/* 0.5.29.1: Match New Instance triangle appearance to Smart Suite Launcher. */
/* 0.5.29.0 EXPERIMENTAL: preview-sized conservative dirty mask, bounded 128px
 * full-resolution tiles, local-contrast source halos, transactional rectangle
 * writes with rollback, optional exhaustive full reference comparison.
 * Unsupported/global operations and broad masks use existing full Apply. */
/* 0.5.29.0: independent channel/mode/lasso radio parents, explicit startup defaults,
 * coalesced adjustment previews (80 ms) with final-release refresh and cleanup,
 * Local Intensity immediately below Stretch Factor. */
/* Performance build: native exact preview + sampled fallback validation; drag histogram cadence; bounded HDR/boundary caches. */
/* SMART STRETCH BUILD 0.5.29.0:
 * Fix Apply Image.free read-only error: explicitly track detached vs borrowed
 * results. Native outputs are released by their window pool; contrast output
 * is detached/owned and freed at final cleanup regardless of native pool state.
 * Auto Contrast equations, preview behavior and numerical checks unchanged.
 * Auto High Contrast toggle: post-stretch low-contrast structure gain map,
 * noise/detail confidence and highlight protection, bilinear spatial feather.
 * Preview is reversible; full Apply commits enhancement. Native full RGB gain
 * multiplication is sampled-validated. Image statistics are heuristic. No
 * guarantee of isolating nebulosity from noise or preserving all high-contrast
 * pixels; bright channels >=0.85 are preserved exactly. History/reset supported.
 * Single-image Quick chooser: STF-style preview, linear endpoints checkbox
 * enabled by default, aggression slider 0..100 centered at 50, explicit OK.
 * Reset restores 50 + linear enabled. Coalesced slider updates (120 ms),
 * pooled native 64-bit preview transformations, cached channel extrema,
 * sampled native/reference validation, graphics scaling without upsample copy.
 * Workspace recycled after 16 updates; close cancels pending timer.
 * Neutral slider exactly retains preceding STF-style parameters. Existing
 * original Quick functions retained for previous history states; new chooser
 * uses STF-style
 * independent RGB or mono curves calculated from pristine reduced source.
 * Black = max(0, median - 2.8 * 1.4826 * MAD); target background 0.25.
 * Optional mode can clip shadows and change RGB balance, as unlinked STF does.
 * Preview-derived parameters are retained for full Apply and edit history.
 * Native HistogramTransformation, sampled numerical validation, JS fallback.
 * Lower choices retain linked linear extrema adjustment. Manual Apply/Commit.
 * Sampled statistics approximate Auto STF; no exact visual match is claimed.
 * Local syntax/arithmetic regressions checked; actual PixInsight testing needed.
 */
/* Installation: download this .txt source and rename it to .js locally.
 */

/* Smart Stretch optimization build 0.5.29.0 (2026-10-08)
 * Rename the script to .js and execute it in PixInsight.
 * Baseline: SmartStretch.txt, 200116 bytes, Library version 55.
 * Changes: prepared exact curves; validated-cell LUTs with exact dark/steep
 * fallback; cached preview signal/mask/range planes; shared histogram/box mean;
 * compact native AS expressions including tonal protections; native image
 * assign for mask copies; read-only fallback base without redundant copy;
 * StdIcon_/StdButton_ constants with standard PJSR includes in all entry scripts.
 * Existing native 64x64 preflight and full-image sample validation retained.
 * Preflight explicitly uses ORIGINAL exact equations, never the LUT reference.
 * Console timings: LUT build, expression generation, native execution/copy/
 * validation/write, preview transform/HDR/boundary/histogram/render, total MP/s.
 * VERIFIED HERE: all five sources parse after stripping PJSR directives;
 * 77 existing Smart Stretch methods retained, local includes resolve;
 * 289260 curve comparisons; exact preparation max error 2.23e-16;
 * LUT max absolute error 1.05e-7, RGB scale error 1.05e-7 in tested grid.
 * 23040 generated-expression arithmetic comparisons: max error 3.78e-15.
 * 144 fallback cases / 94848 samples: max error 6.23e-9.
 * 144 preview cases / 44928 samples: max error 5.58e-9; cached repeats agree.
 * Shared clipped-edge box mean: 224 checks against direct averages.
 * Smart Mask detector: 9 cases / 3519 samples, identical baseline output.
 * JS mock images cover mono/RGB/extra-channel images, RGBK/R/G/B, symmetry/
 * signal/color, masked/unmasked, Quick Stretch, contrast/protection and drag.
 * Arithmetic benchmark: 1M evaluations, prepared curves ~3.3-4.1x baseline
 * in Node; this excludes PJSR image I/O and is NOT a PixInsight speed claim.
 * REQUIRES PIXINSIGHT: PJSR preprocessing/API compatibility, PixelMath parser/
 * symbols/threading, native execution and speed, GUI, HDR/boundary visual
 * regressions, Smart Mask creation/transfer/lasso, Undo/Redo and SPCC workflow.
 * LUT cell probes are empirical checks, not a universal error proof. The
 * dark endpoint and rejected cells use exact equations; no threshold loosening.
 * Planned features retained: Color Mapping (Target Color, Color Strength,
 * Saturation, Preserve Luminance); responsive screen/workspace GUI scaling;
 * further Smart Mask tuning across nebulae, galaxies, gradients and noise.
 * These roadmap features are not introduced by this optimization build.
 */

/*
   Smart Stretch Stage 5.10.11
   Adds true nonlinear selective stretching to the proven Stage 4.3.1 architecture.

   Smart Stretch - Stage 5.10.3
   PixInsight JavaScript / PJSR prototype

   Stage 5.10.3:
   - Repairs embedded Smart Mask preview generation and Create Mask transfer.
   - Adds Process Console diagnostics for embedded detection/preview/transfer.
   - Draws the active Smart Mask lasso as a bright yellow polyline.
   - Full-resolution operations reuse the approved reduced Smart Mask; Smart
     Mask detection is never rerun during Apply.
   - Standalone Smart Mask 0.1.1 creates its full-size PixInsight mask by
     upscaling the exact approved preview mask.
   - Smart Mask detection moved to shared SmartMaskEngine.txt.
   - Improved faint-nebulosity recovery with local-background residuals and
     connected faint-structure growth; bright cores are deliberately compressed.
   - Fixes main-preview Smart Mask overlay, including AS.
   - Same engine is used by standalone SmartMask.txt.
   - Smart Mask preview now independently fits the entire image to its viewport.
   - Smart Mask overlay is centered and refits when the dialog is resized.
   - Create Mask now immediately rebuilds and displays the mask overlay in the
     main Smart Stretch preview, including mask-constrained AS.
   - Adds a dedicated Smart Mask dialog with live reduced-resolution preview.
   - Auto/Nebula/Galaxy detection, Detection Sensitivity, Include Faint Wisps,
     and optional star suppression.
   - Create Mask returns a soft grayscale mask to the current Smart Stretch
     session; Cancel is nondestructive.
   - Smart Mask can constrain AS as well as Signal/Color processing.
   - Existing lasso tools can refine a created Smart Mask.
   Stage 5.8.0:
   - AS histogram clicks choose a pending SP; Commit SP updates the transform.
   - Apply processes the target at full resolution and advances the session base.
   - Keeps the first full-resolution source for reference-aware HDR.
   - Zoom To Peak targets a peak-base width of 20% of plot height.
   - Zoom To Peak frames dominant signal using its peak width, not broad tails.
   - Linear histogram height with 10% headroom and minimal display smoothing.
   - Restored PixInsight-style New Instance triangle and Apply controls at the
     bottom-left of the dialog.
   - Smooth/interpolated histogram rendering, especially for Zoom To Peak.
   - Histogram calculations retain full bin resolution; smoothing is display-only.
   - Live histogram updates preserve the active zoom window.
   - Stretch Factor maximum increased to 18.
   - Symmetry Point mode now uses Local Intensity.
   - Undo/Redo state coverage improved.
   - Rebuilt from the known-working Stage 3 code.
   - Keeps Stage 3 histogram, click selection, Intensity and Contrast controls.
   - Uses a temporary reduced Image for the custom preview.
   - Fits the entire source image within approximately 1280 x 760.
   - Avoids Graphics.drawScaledBitmap().
   - Maps preview clicks back to full-resolution source pixels.
   - Keeps the Stage 4.1 performance-optimized preview architecture.
   - Click directly in the histogram to select a signal value.
   - Histogram clicks use Click Range to set Low/High automatically.
   - The image overlay immediately reveals where that signal occurs.
   - A yellow marker shows the exact histogram value clicked.
   - Normal click starts a new single selection and enables Low/High.
   - Ctrl-click adds/removes ranges on both image and histogram. Alt-click selects only the connected image structure around the clicked point; Ctrl+Alt-click adds/removes spatial structures. While spatial selections are active, histogram selection is locked but histogram zoom remains available.
   - Click Range applies to all selected centers.
   - Multiple ranges disable Low/High and share Intensity/Contrast/Stretch.
   - Apply modifies the active image at full resolution; preview changes remain temporary.

   Future stages:
   - Overlay selected pixels on the preview.
   - Intensity, localized contrast, and true nonlinear selective stretching.
   - Selective HDR tools.
*/

// Display-only zoom: processing buffers retain their established dimensions.
function STPreviewZoom(owner,scroll,getBitmap){
   var z=this;this.factor=1;this.scale=1;this.x=0;this.y=0;this.updating=false;this.maxX=0;this.maxY=0;
   scroll.autoScroll=false;scroll.horizontalScrollBarVisible=false;scroll.verticalScrollBarVisible=false;
   this.minus=new ToolButton(owner);this.minus.text=STHoverCaption(this.minus,"−",0);this.minus.setFixedSize(26,26);this.minus.toolTip="Zoom out (minimum: fit image)";
   this.plus=new ToolButton(owner);this.plus.text=STHoverCaption(this.plus,"+",0);this.plus.setFixedSize(26,26);this.plus.toolTip="Zoom in";
   this.row=new HorizontalSizer;this.row.spacing=4;this.row.addStretch();this.row.add(this.plus);this.row.add(this.minus);
   this.nativeTiles=new STSuiteTiles(owner,z,scroll,getBitmap);
   this.update=function(){if(z.updating)return;if(z.nativeTiles&&!z.nativeTiles.preparing){z.nativeTiles.queue=[];z.nativeTiles.pending={};}z.updating=true;try{
      var b=getBitmap(),vp=scroll.viewport,zoomed=z.factor>1;
      scroll.horizontalScrollBarVisible=zoomed;scroll.verticalScrollBarVisible=zoomed;
      if(!b){scroll.setHorizontalScrollRange(0,0);scroll.setVerticalScrollRange(0,0);z.minus.enabled=z.plus.enabled=false;vp.update();return;}
      var w=Math.max(1,vp.width),h=Math.max(1,vp.height);
      z.scale=Math.min(1,w/b.width,h/b.height)*z.factor;
      var cw=b.width*z.scale,ch=b.height*z.scale;
      var mx=Math.max(0,Math.ceil(cw-w)),my=Math.max(0,Math.ceil(ch-h));
      z.maxX=mx;z.maxY=my;scroll.setHorizontalScrollRange(0,mx);scroll.setVerticalScrollRange(0,my);
      scroll.horizontalScrollPosition=Math.max(0,Math.min(mx,scroll.horizontalScrollPosition));
      scroll.verticalScrollPosition=Math.max(0,Math.min(my,scroll.verticalScrollPosition));
      z.x=Math.max(0,(w-cw)/2)-scroll.horizontalScrollPosition;
      z.y=Math.max(0,(h-ch)/2)-scroll.verticalScrollPosition;
      z.minus.enabled=z.factor>1;z.plus.enabled=z.factor<4096;vp.update();
   }finally{z.updating=false;}};
   this.change=function(mult,ax,ay){if(!getBitmap())return;var vp=scroll.viewport;
      if(typeof ax!="number")ax=vp.width/2;if(typeof ay!="number")ay=vp.height/2;
      var cx=(ax-z.x)/z.scale,cy=(ay-z.y)/z.scale;
      z.factor=Math.max(1,Math.min(4096,z.factor*mult));z.update();
      scroll.horizontalScrollPosition=Math.max(0,Math.min(z.maxX,Math.round(cx*z.scale-ax)));
      scroll.verticalScrollPosition=Math.max(0,Math.min(z.maxY,Math.round(cy*z.scale-ay)));z.update();};
   this.minus.onClick=function(){z.change(1/1.5);};this.plus.onClick=function(){z.change(1.5);};
   this.paint=function(g){g.translateTransformation(z.x,z.y);g.scaleTransformation(z.scale,z.scale);};
   this.install=function(){var vp=scroll.viewport;
      var press=vp.onMousePress,move=vp.onMouseMove,release=vp.onMouseRelease;
      function map(handler){return function(x,y,a,b,c){if(handler)handler.call(vp,(x-z.x)/z.scale,(y-z.y)/z.scale,a,b,c);};}
      if(press)vp.onMousePress=map(press);if(move)vp.onMouseMove=map(move);if(release)vp.onMouseRelease=map(release);
      vp.onMouseWheel=function(x,y,delta,buttons,modifiers){if(!delta||!getBitmap()||owner.lassoDrawing)return;z.change(delta>0?1.5:1/1.5,x,y);};
      vp.onResize=function(){z.update();};scroll.onHorizontalScrollPosUpdated=function(){z.update();};scroll.onVerticalScrollPosUpdated=function(){z.update();};z.update();
   };
}

#feature-id SmartStretch > Smart Stretch 0.5.35.3
#feature-info <b>Smart Stretch 0.5.34.0</b><br/>STF-Style and Image Analysis starting previews, followed by interactive selective stretch.

#define VERSION "0.5.36.1"

#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/ButtonCodes.jsh>
#include <pjsr/TextAlign.jsh>
#define SMART_SUITE_APP
// Embedded SmartTools support.
var STScreenFit = typeof STScreenFit === "undefined" ? {} : STScreenFit;

STScreenFit.px = function(c,n){
   return typeof c.logicalPixelsToPhysical == "function" ? c.logicalPixelsToPhysical(n) : n;
};

STScreenFit.bounds = function(c){
   var r=null;
   try{r=c.availableScreenRect;}catch(e){}
   if(!r || !isFinite(r.width) || !isFinite(r.height) || r.width<160 || r.height<160)
      return {x:0,y:0,width:1000,height:640,fallback:true};
   var mx=STScreenFit.px(c,12),my=STScreenFit.px(c,32);
   return {x:r.x0+mx,y:r.y0+my,
      width:Math.max(120,Math.floor(r.width-2*mx)),
      height:Math.max(120,Math.floor(r.height-2*my)),fallback:false};
};

STScreenFit.center = function(d){
   d.ensureLayoutUpdated();
   var b=STScreenFit.bounds(d);
   d.move(b.x+Math.max(0,Math.floor((b.width-d.width)/2)),
          b.y+Math.max(0,Math.floor((b.height-d.height)/2)));
};

STScreenFit.installCenter = function(d){
   if(d._stCenterInstalled)return;
   var oldShow=d.onShow,oldHide=d.onHide;
   // Native modal placement may run AFTER onShow. Defer the final move until
   // the event loop resumes, retaining the timer for the dialog lifetime.
   d._stCenterTimer=new Timer;d._stCenterTimer.interval=.05;d._stCenterTimer.periodic=false;
   d._stCenterTimer.onTimeout=function(){STScreenFit.center(d);};
   d.onShow=function(){var result;if(oldShow)result=oldShow.apply(d,arguments);STScreenFit.center(d);d._stCenterTimer.start();return result;};
   d.onHide=function(){d._stCenterTimer.stop();if(oldHide)return oldHide.apply(d,arguments);return undefined;};
   d._stCenterInstalled=true;
};

STScreenFit.sideWidth = function(c){
   return Math.max(160,Math.min(820,Math.floor(STScreenFit.bounds(c).width*.42)));
};

STScreenFit.previewSize = function(c,w,h,reserveWidth,reserveHeight){
   var b=STScreenFit.bounds(c);
   var rw=reserveWidth===undefined ? STScreenFit.sideWidth(c)+80 : reserveWidth;
   var rh=reserveHeight===undefined ? STScreenFit.px(c,340) : reserveHeight;
   return {width:Math.max(100,Math.min(w||1280,Math.floor(b.width-rw))),
      height:Math.max(80,Math.min(h||760,Math.floor(b.height-rh)))};
};

STScreenFit.preview = function(c,w,h,rw,rh,fixed){
   var s=STScreenFit.previewSize(c,w,h,rw,rh);
   if(fixed)c.setFixedSize(s.width,s.height);else c.setMinSize(s.width,s.height);
   return s;
};

STScreenFit.tileSize = function(c,w,h,columns,rows,overhead){
   var b=STScreenFit.bounds(c);
   return {width:Math.max(60,Math.min(w,Math.floor((b.width-STScreenFit.px(c,60))/columns))),
      height:Math.max(45,Math.min(h,Math.floor((b.height-STScreenFit.px(c,overhead||360))/rows)))};
};

STScreenFit.scroll = function(owner,layout,w,h){
   var box=new ScrollBox(owner),document=new Control(box.viewport);
   box.autoScroll=true;box.lineWidth=STScreenFit.px(owner,24);box.lineHeight=STScreenFit.px(owner,24);
   document.sizer=layout;document.adjustToContents();
   var naturalW=Math.max(1,document.width),naturalH=Math.max(1,document.height),updating=false;
   box.setMinSize(Math.min(w,STScreenFit.px(owner,240)),Math.min(h,STScreenFit.px(owner,100)));
   box.resize(w,h);
   var update=function(){
      if(updating)return;updating=true;
      try{
         document.resize(Math.max(naturalW,box.viewport.width),Math.max(naturalH,box.viewport.height));
         box.pageWidth=box.viewport.width;box.pageHeight=box.viewport.height;
         box.setHorizontalScrollRange(0,Math.max(0,document.width-box.viewport.width));
         box.setVerticalScrollRange(0,Math.max(0,document.height-box.viewport.height));
         document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);
      }finally{updating=false;}
   };
   box.viewport.onResize=update;
   box.onHorizontalScrollPosUpdated=function(){document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);};
   box.onVerticalScrollPosUpdated=function(){document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);};
   box.viewport.onMouseWheel=function(x,y,delta){
      var step=delta>0?-box.lineHeight*3:delta<0?box.lineHeight*3:0;
      box.verticalScrollPosition=Math.max(0,Math.min(box.maxVerticalScrollPosition,box.verticalScrollPosition+step));
      document.move(-box.horizontalScrollPosition,-box.verticalScrollPosition);
   };
   box._stDocument=document;box._stUpdate=update;
   box._stNaturalWidth=naturalW;box._stNaturalHeight=naturalH;
   update();return box;
};

STScreenFit.panel = function(owner,layout){
   var b=STScreenFit.bounds(owner),w=STScreenFit.sideWidth(owner),h=Math.max(80,b.height-STScreenFit.px(owner,140));
   var box=STScreenFit.scroll(owner,layout,w,h);
   box.setMinSize(w,h);return box;
};

STScreenFit.limit = function(d,initial){
   var b=STScreenFit.bounds(d);
   d.setMinSize(Math.min(STScreenFit.px(d,360),b.width),Math.min(STScreenFit.px(d,240),b.height));
   d.setMaxSize(b.width,b.height);
   d.resize(Math.min(b.width,initial?d._stDesiredWidth:d.width),Math.min(b.height,initial?d._stDesiredHeight:d.height));
   return b;
};

STScreenFit.install = function(d){
   if(d._stScreenFitted || !d._stBody)return;
   var body=d._stBody,footer=d._stFooter||null;
   if(footer)body.remove(footer);
   // _stBody is a fresh, unattached layout, never previously a dialog sizer.
   // Every sizer is assigned once. Do not clear, detach or transfer a native
   // control's sizer: PJSR rejects that with "Illegal call to SetSizer".
   var b=STScreenFit.bounds(d),box=STScreenFit.scroll(d,body,b.width-16,b.height-70);
   var root=new VerticalSizer;root.margin=6;root.spacing=6;root.add(box,100);
   if(footer)root.add(footer);
   d.sizer=root;d.userResizable=true;
   d._stScreenFitted=true;
   d._stScroll=box;
   d._stDesiredWidth=Math.min(b.width,box._stNaturalWidth+STScreenFit.px(d,36));
   d._stDesiredHeight=Math.min(b.height,box._stNaturalHeight+STScreenFit.px(d,footer?100:36));
   d.adjustToContents();STScreenFit.limit(d,true);
   var oldShow=d.onShow,oldMove=d.onMove,moving=false;
   var position=function(){
      if(moving)return;moving=true;
      try{
         var a=STScreenFit.limit(d,false),p=d.position;
         d.move(Math.max(a.x,Math.min(p.x,a.x+a.width-d.width)),Math.max(a.y,Math.min(p.y,a.y+a.height-d.height)));
         box._stUpdate();
      }finally{moving=false;}
   };
   d.onShow=function(){position();var result;if(oldShow)result=oldShow.apply(d,arguments);position();return result;};
   d.onMove=function(){if(oldMove)oldMove.apply(d,arguments);position();};
   STScreenFit.installCenter(d);
   if(typeof console!="undefined" && console.writeln)
      console.writeln("[Smart Tools Screen Fit 1.0.3] "+Math.round(b.width)+"x"+Math.round(b.height)+" available; window "+d.width+"x"+d.height+(b.fallback?" (conservative fallback)":""));
};

STScreenFit.adjust = function(d){
   if(d instanceof Dialog && d._stBody){
      STScreenFit.install(d);
      d.ensureLayoutUpdated();STScreenFit.limit(d,false);
      return d;
   }
   return d.adjustToContents();
};

STScreenFit.show = function(d){
   if(d instanceof Dialog){STScreenFit.install(d);STScreenFit.installCenter(d);}
   return d.show();
};

STScreenFit.execute = function(d){
   if(d instanceof Dialog){STScreenFit.install(d);STScreenFit.installCenter(d);}
   return d.execute();
};

var SmartTools = typeof SmartTools === "undefined" ? {} : SmartTools;

SmartTools.previewWidth=1280;

SmartTools.previewHeight=760;

SmartTools.now=function(){return new Date().getTime();};

SmartTools.elapsed=function(t){return ((SmartTools.now()-t)/1000).toFixed(2)+" s";};

SmartTools.clamp=function(x,a,b){return Math.max(a,Math.min(b,x));};

SmartTools.percentile=function(a,p){
   if(!a.length)return 0;
   a.sort(function(x,y){return x-y;});
   return a[Math.max(0,Math.min(a.length-1,Math.round(p*(a.length-1))))];
};

SmartTools.copyWindow=function(im,id){
   var w=new ImageWindow(im.width,im.height,im.numberOfChannels,32,true,im.numberOfChannels>=3,id||"SmartTools_Work");
   try{
      w.hide();SmartTools.beginPrivateProcess(w.mainView);
      try{w.mainView.image.assign(im);}finally{w.mainView.endProcess();}
      return w;
   }catch(e){w.forceClose();throw e;}
};

SmartTools.configurePixelMath=function(p,bits){
   p.clearImageCacheAndExit=false;p.cacheGeneratedImages=false;
   p.generateOutput=true;p.singleThreaded=false;p.optimization=true;
   p.use64BitWorkingImage=bits!==32;p.createNewImage=false;
   p.rescale=false;p.truncate=true;p.truncateLower=0;p.truncateUpper=1;
   return p;
};

SmartTools.pixelMath=function(view,expr,symbols){
   var p=SmartTools.configurePixelMath(new PixelMath);
   p.useSingleExpression=true;p.expression=expr;p.symbols=symbols||"";
   if(!p.executeOn(view))throw new Error("PixelMath execution failed");
};

SmartTools.prepareStretch=function(stretch,sp,li,symmetry){
   var k=Math.pow(10,0.75*stretch)-1,den=k>=1e-8?Math.asinh(k):1;
   sp=SmartTools.clamp(sp,0.000001,0.999999);li=SmartTools.clamp(li,0,1);
   return function(v){
      if(stretch<=0 || k<1e-8)return v;
      var base,position,d;
      if(symmetry){
         base=v;
         if(v<sp)base=sp-sp*Math.asinh(k*((sp-v)/sp))/den;
         else if(v>sp)base=sp+(1-sp)*Math.asinh(k*((v-sp)/(1-sp)))/den;
         if(Math.abs(li-0.5)<1e-8)return base;
         position=v<sp?-Math.min(1,(sp-v)/sp):v>sp?Math.min(1,(v-sp)/(1-sp)):0;
         d=(position-(2*li-1))/0.70;
         return v+(0.18+0.82*Math.exp(-0.5*d*d))*(base-v);
      }
      base=Math.asinh(k*v)/den;
      if(Math.abs(li-0.5)<1e-8)return base;
      d=(v-li)/0.22;
      return v+(0.12+0.88*Math.exp(-0.5*d*d))*(base-v);
   };
};

SmartTools.stretchLUT=function(exact,n){
   n=n||16384;var a=new Array(n+1),safe=new Array(n),accepted=0,max=0;
   for(var i=0;i<=n;++i)a[i]=exact(i/n);
   for(var j=0;j<n;++j){
      var ok=true;
      for(var q=1;q<4;++q){
         var f=q/4,v=(j+f)/n,e=Math.abs(exact(v)-(a[j]+f*(a[j+1]-a[j])));
         max=Math.max(max,e);
         if(!isFinite(e)||e>1e-7*Math.max(v,1e-8))ok=false;
      }
      // Never interpolate the dark endpoint: relative scale error there is
      // much more sensitive than the quarter-cell probes can establish.
      if(j==0)ok=false;
      safe[j]=ok;if(ok)++accepted;
   }
   var fn=function(v){
      if(v<0||v>1||!isFinite(v))return exact(v);
      if(v==1)return a[n];
      var z=v*n,i=Math.floor(z);
      return safe[i]?a[i]+(z-i)*(a[i+1]-a[i]):exact(v);
   };
   fn.safeCells=accepted;fn.cells=n;fn.probeMaxError=max;
   return fn;
};

SmartTools.signalPlane=function(image,mode){
   var w=image.width,h=image.height,a=new Array(w*h),c=image.numberOfChannels;
   var ch=mode=="R"?0:mode=="G"?1:mode=="B"?2:-1;
   for(var y=0;y<h;++y)for(var x=0;x<w;++x)
      a[y*w+x]=c<3?image.sample(x,y,0):ch>=0?image.sample(x,y,ch):
         0.2126*image.sample(x,y,0)+0.7152*image.sample(x,y,1)+0.0722*image.sample(x,y,2);
   return a;
};

SmartTools.boxSignalMean=function(image,radius,signalAt)
{
      var W=image.width,H=image.height;
      var stride=W+1;
      var integral=new Array((W+1)*(H+1));
      for(var z=0;z<integral.length;++z)integral[z]=0;
      for(var y=0;y<H;++y)
      {
         var row=0;
         for(var x=0;x<W;++x)
         {
            row+=signalAt(image,x,y);
            integral[(y+1)*stride+(x+1)]=
               integral[y*stride+(x+1)]+row;
         }
      }
      var mean=new Image(W,H,1);
      for(var yy=0;yy<H;++yy)
         for(var xx=0;xx<W;++xx)
         {
            var x0=Math.max(0,xx-radius),x1=Math.min(W-1,xx+radius);
            var y0=Math.max(0,yy-radius),y1=Math.min(H-1,yy+radius);
            var A=integral[y0*stride+x0];
            var B=integral[y0*stride+(x1+1)];
            var C=integral[(y1+1)*stride+x0];
            var D=integral[(y1+1)*stride+(x1+1)];
            mean.setSample((D-B-C+A)/((x1-x0+1)*(y1-y0+1)),xx,yy,0);
         }
      return mean;
};

SmartTools.histogram = function( image, numberOfBins, channelMode )
{
   var bins = new Array( numberOfBins );

   for ( var i = 0; i < numberOfBins; ++i )
      bins[i] = 0;

   var w = image.width;
   var h = image.height;

   // Sampling keeps the Stage 1 UI responsive on large ASI2600 frames.
   var targetSamples = 250000;
   var step = Math.max( 1, Math.ceil( Math.sqrt( w*h/targetSamples ) ) );

   for ( var y = 0; y < h; y += step )
      for ( var x = 0; x < w; x += step )
      {
         var value;

         if(image.numberOfChannels<3)value=image.sample(x,y,0);
         else if(channelMode=="R")value=image.sample(x,y,0);
         else if(channelMode=="G")value=image.sample(x,y,1);
         else if(channelMode=="B")value=image.sample(x,y,2);
         else
         {
            var r=image.sample(x,y,0),g=image.sample(x,y,1),b=image.sample(x,y,2);
            value=0.2126*r+0.7152*g+0.0722*b;
         }

         value = Math.max( 0, Math.min( 1, value ) );

         var bin = Math.floor( value*numberOfBins );
         if ( bin >= numberOfBins )
            bin = numberOfBins - 1;

         ++bins[bin];
      }

   return bins;
};

SmartTools.resetViewSTF=function(view){
   var process=new ScreenTransferFunction;
   if(!process.executeOn(view))
      throw new Error("ScreenTransferFunction reset failed");
};

SmartTools.pixelSummary=function(image){
   var c=Math.min(3,image.numberOfChannels),values=[],white=0,n=0,min=1,max=0;
   for(var iy=0;iy<16;++iy)for(var ix=0;ix<24;++ix){
      var x=Math.min(image.width-1,Math.floor((ix+0.5)*image.width/24));
      var y=Math.min(image.height-1,Math.floor((iy+0.5)*image.height/16));
      var allWhite=true;
      for(var ch=0;ch<c;++ch){
         var v=image.sample(x,y,ch);if(!isFinite(v))throw new Error("Nonfinite output pixel");
         values.push(v);min=Math.min(min,v);max=Math.max(max,v);
         if(v<0.999999)allWhite=false;
      }
      if(allWhite)++white;++n;
   }
   return {minimum:min,maximum:max,median:SmartTools.percentile(values,0.5),whiteFraction:white/n};
};

SmartTools.acquireWindow=function(pool,key,w,h,c,bits,color){
   var slot=pool[key];
   if(slot && (slot.width!=w || slot.height!=h || slot.channels!=c || slot.bits!=bits)){
      slot.window.forceClose();delete pool[key];slot=null;
   }
   if(!slot){
      var win=new ImageWindow(w,h,c,bits,true,color,"SmartStretch_"+key);
      try{win.hide();}catch(e){win.forceClose();throw e;}
      slot={window:win,width:w,height:h,channels:c,bits:bits};pool[key]=slot;
   }
   return slot.window;
};

SmartTools.closeWindowPool=function(pool){
   if(!pool)return;
   for(var key in pool)if(pool.hasOwnProperty(key)){
      try{pool[key].window.forceClose();}catch(e){}
      delete pool[key];
   }
};

SmartTools.nativeStretchTable=function(exact,sp,halfCells,tolerance){
   var n=halfCells||32768,m=2*n,a=new Array(m+1),maxError=0;
   var signal=function(q){
      var z=q<1?1-q:q-1,z2=z*z;
      return q<1?sp-sp*z2*z2:sp+(1-sp)*z2*z2;
   };
   for(var j=0;j<=m;++j){a[j]=exact(signal(j/n));if(!isFinite(a[j]))return null;}
   for(var i=0;i<m;++i)for(var k=1;k<8;++k){
      var f=k/8,ref=exact(signal((i+f)/n));
      var error=Math.abs(ref-(a[i]+f*(a[i+1]-a[i])));
      if(!isFinite(error)||error>(tolerance||2e-7))return null;
      maxError=Math.max(maxError,error);
   }
   return {values:a,halfCells:n,cells:m,sp:sp,probeMaxError:maxError};
};

SmartTools.beginPrivateProcess=function(view){
   if(typeof UndoFlag_NoSwapFile!="undefined")view.beginProcess(UndoFlag_NoSwapFile);
   else view.beginProcess();
};

SmartTools.uniformNativeTable=function(exact,low,high,cells,gain,maxChannel){
   if(!isFinite(low)||!isFinite(high)||low<0||high>1||high<=low)return null;
   if(gain && low<=1e-8)return null; // do not interpolate across the gain discontinuity
   var n=cells||16384,a=new Array(n+1),span=high-low,maxError=0;
   var fn=function(v){var target=exact(v);return gain?target/v:target;};
   for(var i=0;i<=n;++i){a[i]=fn(low+span*i/n);if(!isFinite(a[i]))return null;}
   for(var j=0;j<n;++j)for(var k=1;k<8;++k){
      var f=k/8,v=low+span*(j+f)/n;
      var error=Math.abs(fn(v)-(a[j]+f*(a[j+1]-a[j])));
      // Gain error is bounded conservatively in OUTPUT channel units.
      if(gain)error*=maxChannel;
      if(!isFinite(error)||error>2e-7)return null;
      maxError=Math.max(maxError,error);
   }
   return {values:a,cells:n,low:low,high:high,uniform:true,gain:!!gain,
      probeMaxError:maxError};
};

SmartTools.piecewiseGainTable=function(exact,low,high,sp,maxChannel){
   if(!isFinite(low)||!isFinite(high)||low<=1e-8||high>1||high<=low)return null;
   var segments=[],failed=false,maxError=0;
   var refine=function(lo,hi,depth){
      if(failed)return;
      var table=null;
      for(var cells=512;cells<=8192 && !table;cells*=2)
         table=SmartTools.uniformNativeTable(exact,lo,hi,cells,true,maxChannel);
      if(table){
         if(segments.length>=8){failed=true;return;}
         segments.push(table);maxError=Math.max(maxError,table.probeMaxError);return;
      }
      if(depth>=8 || segments.length>=8){failed=true;return;}
      var mid=lo+(hi-lo)*0.5;
      if(mid<=lo || mid>=hi){failed=true;return;}
      refine(lo,mid,depth+1);refine(mid,hi,depth+1);
   };
   // Place a boundary exactly at the symmetry point if it lies in the domain.
   if(sp>low && sp<high){refine(low,sp,0);refine(sp,high,0);}
   else refine(low,high,0);
   if(failed || !segments.length)return null;
   var values=[],total=0;
   for(var i=0;i<segments.length;++i){
      var t=segments[i];t.offset=total;
      // Adjacent segments share their common endpoint.
      for(var j=i?1:0;j<=t.cells;++j)values.push(t.values[j]);
      total+=t.cells;
   }
   return {values:values,cells:total,low:low,high:high,gain:true,piecewise:true,
      segments:segments,probeMaxError:maxError};
};

SmartTools.configureNumericInput=function(control,onTextCommit){
   // Preserve the caller's track width and NumericControl layout.
   control.edit.onEditCompleted=function(){
      // Enter/edit-completed must not process while the edit retains focus.
   };
   control.edit.onLoseFocus=function(){
      if(this.readOnly)return;
      var previous=control.value;
      control.evaluate();
      if(control.value!=previous && onTextCommit)onTextCommit(control.value);
   };
   // Font-relative dimensions keep the rectangular handle usable with display
   // scaling. Scope to this native slider; preserve all slider event handlers.
   control.slider.styleSheet=
      "QSlider::groove:horizontal { image: none; border-image: none;"+
      " height: 0.4em; border: 1px solid palette(mid); background: palette(base); }"+
      "QSlider::handle:horizontal { image: none; border-image: none;"+
      " width: 0.55em; margin: -0.45em 0; border: 1px solid palette(dark);"+
      " border-radius: 2px; background: palette(button); }"+
      "QSlider::handle:horizontal:hover, QSlider::handle:horizontal:pressed {"+
      " image: none; border-image: none; background: palette(highlight); }"+
      "QSlider::handle:horizontal:disabled { image: none; border-image: none;"+
      " background: palette(mid); border-color: palette(mid); }";
};

SmartTools.readPlane=function(im,ch){var a=[];
   if(typeof im.getSamples=="function")im.getSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)a.push(im.sample(x,y,ch));
   if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");return a;
};

SmartTools.writePlane=function(im,a,ch){if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");
   if(typeof im.setSamples=="function")im.setSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)im.setSample(a[y*im.width+x],x,y,ch);
};

function STSuiteSource(o){
   if(o.activeView)return o.activeView.image;
   if(o.calibrated)return o.calibrated;
   if(o.source&&typeof o.source.sample==='function'){
      if(o.view&&o.view.image&&o.source.width<o.view.image.width)return o.view.image;
      return o.source;
   }
   return o.view&&!o.view.isNull?o.view.image:null;
}

function STSuiteReleaseWindow(window){
 var current=window;
 return function(){var owned=current;current=null;if(owned&&!owned.isNull)owned.forceClose();};
}

function STSuiteOwned(image){var current=image;return {image:image,release:function(){var owned=current;current=null;if(owned)owned.free();}};}

function STSuitePrepare(o){
   var src=STSuiteSource(o),result;
   if(!src)throw Error('Load an image first.');
   if(typeof o.processFullResolution==='function'){
      if(o.before_CheckBox.checked){if(o.basicStretchEnabled){if(!o.quickAnalysisRecipe)return STSuiteOwned(o.processNativeQuick(src,false));var base=o.quickFaintPass(src);try{if(o.basicStretchLinearEnabled){var linear=o.quickLinearPass(base);base.free();base=linear;}if(o.quickNebulosityEnabled){var nebulosity=o.quickNebulosityPass(base,o.quickNebulosityStrength,false,true);base.free();base=nebulosity;}return STSuiteOwned(base);}catch(e){base.free();throw e;}}return {image:src};}
      result=o.processFullResolution(src,false);
      if(o.autoHighContrastEnabled)result=o.replaceApplyResultWithContrast(result,true).image;
      if(o.autoColorBrightnessEnabled)result=o.replaceApplyResultWithAutoColor(result,true).image;
      return STSuiteOwned(result);
   }
   if(typeof o.transform==='function'){
      if(o.showingMask){
         var mask=o.buildMask(src,true,null),mv=mask.mainView,mi=mv.image;
         return {image:src,release:STSuiteReleaseWindow(mask),mapTile:function(planes,rect,w,h){
            var masks=[];for(var c=0;c<mi.numberOfChannels;c++){var m=new Float32Array(w*h);mi.getSamples(m,rect,c);masks.push(m);}
            for(var c=0;c<planes.length;c++){var weights=masks[Math.min(c,masks.length-1)],p=planes[c];for(var i=0;i<p.length;i++){var a=.55*weights[i];p[i]=p[i]*(1-a)+(c==1?0:a);}}return planes;
         }};
      }
      if(o.displayIsOriginal)return {image:src};
      if(typeof o.mapPlanes==='function'){
         var tileMask=o.buildMask(src,true,null),tileMaskImage=tileMask.mainView.image;
         return {image:src,release:STSuiteReleaseWindow(tileMask),mapTile:function(planes,rect,w,h){
            var weights=[];for(var c=0;c<tileMaskImage.numberOfChannels;c++){var a=new Float32Array(w*h);tileMaskImage.getSamples(a,rect,c);weights.push(a);}
            var wasTiled=o.tiledMapping;o.tiledMapping=true;try{return o.mapPlanes({width:w,height:h},planes,weights);}finally{o.tiledMapping=wasTiled;}
         }};
      }
      var win=o.transform(src,true),view=win.mainView;
      return {image:view.image,release:STSuiteReleaseWindow(win)};
   }
   if(o.calibrated&&typeof o.expression==='function'){
      var star=SmartTools.copyWindow(o.calibrated,'SmartStar_NativeZoom');
      try{SmartTools.pixelMath(star.mainView,o.expression(),SSS_SYMBOLS);return {image:star.mainView.image,release:STSuiteReleaseWindow(star)};}catch(e){star.forceClose();throw e;}
   }
   if(typeof o.compute==='function'&&typeof o.reference==='function'){
      var repair=o.displayImage===o.small&&!o.displayMask?{image:new Image(src)}:o.compute(src,o.displayMask);
      try{result=SBDisplayImage(repair.image,o.stf.checked?o.displaySTF:null);}finally{repair.image.free();}return STSuiteOwned(result);
   }
   if(o.spatialGains&&typeof o.cut==='number'){
      o.compute();var W=o.source.width,H=o.source.height,sw=src.width,sh=src.height;
      var gain=o.spatialGains,weights=o.spatialWeights,cut=o.cut,strength=o.strength.value,protect=o.protect.checked,before=o.before,mask=o.mask,light=o.light.checked,black=o.black,white=o.white;
      var sample=function(a,x,y){var gx=Math.max(0,Math.min(W-1,(x+.5)*W/sw-.5)),gy=Math.max(0,Math.min(H-1,(y+.5)*H/sh-.5)),ix=Math.floor(gx),iy=Math.floor(gy),jx=Math.min(W-1,ix+1),jy=Math.min(H-1,iy+1),tx=gx-ix,ty=gy-iy;return (a[iy*W+ix]*(1-tx)+a[iy*W+jx]*tx)*(1-ty)+(a[jy*W+ix]*(1-tx)+a[jy*W+jx]*tx)*ty;};
      return {image:src,shade:function(rgb,x,y){var Y=rgb.length==1?rgb[0]:.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],g=before?1:HDRProtectGain(sample(gain,x,y),Y,cut,strength,protect),out=[];
         for(var c=0;c<rgb.length;c++){var v=rgb[c]*g;if(mask){var t=Math.max(0,Math.min(1,(Y-cut)/Math.max(1e-12,cut)));v=sample(weights,x,y)*(protect?t*t*(3-2*t):1);}else if(light){v=Math.max(0,(v-black)/(white-black));v=.75*Math.log(10*v+Math.sqrt(100*v*v+1))/Math.log(10+Math.sqrt(101));}out[c]=Math.max(0,Math.min(1,v));}return out;}};
   }
   throw Error('This dialog has no native processing adapter.');
}

function STSuiteTiles(owner,z,scroll,getBitmap){
   var n=this;n.buffer=null;n.bitmap=null;n.cache={};n.keys=[];n.queue=[];n.pending={};n.failed=false;n.preparing=false;n.timer=new Timer;n.timer.interval=.001;n.timer.periodic=false;
   n.label=new Label(owner);n.label.text='Overview';n.label.setFixedWidth(220);n.label.toolTip='At 50% native scale, visible original-resolution tiles replace the overview. Full-result tools prepare a complete result buffer first; this can take time and memory.';
   n.schedule=function(){if(!n.timer.isRunning)n.timer.start();};
   n.clear=function(){n.timer.stop();n.cache={};n.keys=[];n.queue=[];n.pending={};n.failed=false;var oldBuffer=n.buffer;n.buffer=null;if(oldBuffer&&oldBuffer.release)oldBuffer.release();};
   n.timer.onTimeout=function(){
      if(n.preparing||n.failed)return;
      if(getBitmap()!==n.bitmap){n.clear();n.bitmap=getBitmap();scroll.viewport.update();return;}
      if(!n.buffer){
         n.preparing=true;n.label.text='Preparing native result...';var enabled=owner.enabled,expected=n.bitmap;owner.enabled=false;
         try{processEvents();var buffer=STSuitePrepare(owner);if(getBitmap()!==expected){if(buffer.release)buffer.release();return;}n.buffer=buffer;}
         catch(e){n.failed=true;n.label.text='Native preview failed: '+String(e);console.warningln(n.label.text);}
         finally{owner.enabled=enabled;n.preparing=false;scroll.viewport.update();}
         return;
      }
      if(!n.queue.length)return;var deadline=SmartTools.now()+12;do{var t=n.queue.shift();delete n.pending[t.key];var im=null;
      try{
         var src=n.buffer.image,C=src.numberOfChannels,rect=new Rect(t.x,t.y,t.x+t.w,t.y+t.h),planes=[];
         for(var c=0;c<C;c++){planes[c]=new Float32Array(t.w*t.h);src.getSamples(planes[c],rect,c);}
         if(n.buffer.mapTile)planes=n.buffer.mapTile(planes,rect,t.w,t.h);
         if(n.buffer.shade)for(var y=0;y<t.h;y++)for(var x=0;x<t.w;x++){var i=y*t.w+x,rgb=[];for(c=0;c<C;c++)rgb.push(planes[c][i]);var mapped=n.buffer.shade(rgb,t.x+x,t.y+y);for(c=0;c<C;c++)planes[c][i]=mapped[c];}
         im=new Image(t.w,t.h,C,src.colorSpace,32,SampleType_Real);for(c=0;c<C;c++)im.setSamples(planes[c],new Rect(0,0,t.w,t.h),c);
         n.cache[t.key]=im.render();n.keys.push(t.key);
         // 512 RGBA tiles have a maximum bitmap payload of 128 MiB.
         while(n.keys.length>512)delete n.cache[n.keys.shift()];
      }catch(e){n.failed=true;n.label.text='Native tile failed: '+String(e);n.queue=[];console.warningln(n.label.text);}
      finally{if(im)im.free();}
      }while(n.queue.length&&!n.failed&&SmartTools.now()<deadline);
      scroll.viewport.update();
      if(n.queue.length&&!n.failed)n.schedule();
   };
   n.paint=function(g){
      var b=getBitmap(),src=STSuiteSource(owner);if(!b||!src)return;
      if(n.bitmap!==b){if(n.preparing)return;n.clear();n.bitmap=b;}
      var nativeScale=z.scale*b.width/src.width;
      n.queue=[];n.pending={};
      if(nativeScale<.5){n.label.text='Overview '+(nativeScale*100).toFixed(0)+'%';return;}
      if(n.failed)return;if(!n.buffer){if(!n.preparing){n.label.text='Preparing native result...';n.schedule();}return;}
      src=n.buffer.image;var sx=b.width/src.width,sy=b.height/src.height,vp=scroll.viewport;
      var x0=Math.max(0,Math.floor((-z.x/z.scale)/sx/256)),y0=Math.max(0,Math.floor((-z.y/z.scale)/sy/256));
      var x1=Math.min(Math.ceil(src.width/256),Math.ceil(((vp.width-z.x)/z.scale)/sx/256)),y1=Math.min(Math.ceil(src.height/256),Math.ceil(((vp.height-z.y)/z.scale)/sy/256)),ready=0,total=0;
      for(var ty=y0;ty<y1;ty++)for(var tx=x0;tx<x1;tx++){
         var key=tx+'|'+ty,x=tx*256,y=ty*256,w=Math.min(256,src.width-x),h=Math.min(256,src.height-y);total++;
         if(n.cache[key]){ready++;g.drawScaledBitmap(new Rect(x*sx,y*sy,(x+w)*sx,(y+h)*sy),n.cache[key]);}
         else if(!n.pending[key]){n.queue.push({key:key,x:x,y:y,w:w,h:h});n.pending[key]=true;}
      }
      n.label.text=(nativeScale*100).toFixed(0)+'% native | tiles '+ready+'/'+total;if(n.queue.length)n.schedule();
   };
   var hide=owner.onHide;owner.onHide=function(){n.clear();n.bitmap=null;if(hide)return hide.apply(owner,arguments);return undefined;};
   var fit=new ToolButton(owner);fit.text='Fit';fit.onClick=function(){z.factor=1;scroll.horizontalScrollPosition=0;scroll.verticalScrollPosition=0;z.update();};
   var one=new ToolButton(owner);one.text='1:1';one.toolTip='One native image pixel per screen pixel. Native preparation may take time.';one.onClick=function(){var b=getBitmap(),src=STSuiteSource(owner);if(!b||!src)return;z.change((src.width/b.width)/z.scale);};
   z.row.insert(0,fit);z.row.insert(1,one);z.row.insert(2,n.label);z.nativeTiles=n;
}

// Embedded SmartMaskEngine support.
function SmartMaskEngine()
{
}

SmartMaskEngine.cache=null;

SmartMaskEngine.percentile = SmartTools.percentile;

function SMEBuffer(w,h){if(typeof w=="object"){this.width=w.width;this.height=w.height;this.data=w.data.slice();}
   else{this.width=w;this.height=h;this.data=new Array(w*h);for(var i=0;i<this.data.length;i++)this.data[i]=0;}}

SmartMaskEngine.boxMean=function(src,r){var W=src.width,H=src.height,stride=W+1,a=new Array((W+1)*(H+1));
   for(var i=0;i<a.length;i++)a[i]=0;
   for(var y=0;y<H;y++){var sum=0;for(var x=0;x<W;x++){sum+=src.data[y*W+x];a[(y+1)*stride+x+1]=a[y*stride+x+1]+sum;}}
   var out=new SMEBuffer(W,H);for(var y=0;y<H;y++)for(var x=0;x<W;x++){
      var x0=Math.max(0,x-r),x1=Math.min(W,x+r+1),y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
      out.data[y*W+x]=(a[y1*stride+x1]-a[y0*stride+x1]-a[y1*stride+x0]+a[y0*stride+x0])/((x1-x0)*(y1-y0));}return out;
};

SmartMaskEngine.clearCache=function(){SmartMaskEngine.cache=null;};

SmartMaskEngine.prepare=function(src){var t=SmartTools.now(),W=src.width,H=src.height,C=src.numberOfChannels;
   var planes=[SmartTools.readPlane(src,0)];if(C>=3){planes.push(SmartTools.readPlane(src,1));planes.push(SmartTools.readPlane(src,2));}
   var lum=new SMEBuffer(W,H);for(var i=0;i<W*H;i++)lum.data[i]=C<3?planes[0][i]:.2126*planes[0][i]+.7152*planes[1][i]+.0722*planes[2][i];
   var cache=SmartMaskEngine.cache,hit=!!(cache&&cache.width==W&&cache.height==H);
   if(hit)for(var i=0;i<lum.data.length;i++)if(lum.data[i]!==cache.lum.data[i]){hit=false;break;}
   if(!hit)cache=SmartMaskEngine.cache={width:W,height:H,lum:lum,maps:{},stats:null,robust:null};
   console.writeln("[Smart Mask Perf] Bulk source / exact cache check: "+SmartTools.elapsed(t)+"; "+(hit?"HIT":"MISS")+"; pixels="+W*H);
   return cache;
};

SmartMaskEngine.generateLegacy = function(src,options,progress)
{
   var W=src.width,H=src.height;
   var sensitivity=Math.max(0,Math.min(1,options.sensitivity));
   var wisps=Math.max(0,Math.min(1,options.wisps));
   var suppressStars=options.suppressStars!==false;
   var mode=options.mode||"auto";

   function report(p,t){if(progress)progress(p,t);}

   report(2,"Building luminance map…");
   var prepared=SmartMaskEngine.prepare(src),lum=prepared.lum,prepStart=SmartTools.now();
   var samples=[],step=Math.max(1,Math.floor(Math.sqrt(W*H/60000)));
   for(var sy=0;sy<H;sy+=step)
      for(var sx=0;sx<W;sx+=step)samples.push(lum.sample(sx,sy,0));

   if(!prepared.stats)prepared.stats={bg:SmartMaskEngine.percentile(samples,0.22),p50:SmartMaskEngine.percentile(samples,0.50),p70:SmartMaskEngine.percentile(samples,0.70)};
   var adaptive=options.algorithm=="adaptive",floor=adaptive?1e-8:1e-5;
   var robust=adaptive?SmartMaskEngine.robustStats(prepared):null;
   var bg=adaptive?robust.bg:prepared.stats.bg;
   var p50=prepared.stats.p50;
   var p70=prepared.stats.p70;
   var noise=adaptive?robust.noise:Math.max(1.0e-5,Math.max((p70-bg)/1.45,(p50-bg)/0.75));

   if(mode=="auto")
   {
      var bright=0,thr=bg+4.2*noise,total=0;
      for(var ay=0;ay<H;ay+=3)for(var ax=0;ax<W;ax+=3)
      {++total;if(lum.sample(ax,ay,0)>thr)++bright;}
      mode=(bright/Math.max(1,total)<0.030)?"galaxy":"nebula";
   }

   report(12,"Measuring local and broad structure…");
   var map=prepared.maps[mode],mapHit=!!map;
   if(!map)map=prepared.maps[mode]={small:SmartMaskEngine.boxMean(lum,mode=="galaxy"?3:4),medium:SmartMaskEngine.boxMean(lum,mode=="galaxy"?10:14),large:SmartMaskEngine.boxMean(lum,mode=="galaxy"?24:38)};
   var small=map.small,medium=map.medium,large=map.large;
   console.writeln("[Smart Mask Perf] Statistics / multiscale maps: "+SmartTools.elapsed(prepStart)+"; "+(mapHit?"HIT":"MISS"));var stage=SmartTools.now();

   var seed=new SMEBuffer(W,H,1),candidate=new SMEBuffer(W,H,1);
   var seedThreshold=bg+noise*(3.2-1.8*sensitivity);
   var faintSigma=2.0-1.45*wisps; // 2 sigma down toward ~0.55 sigma
   var faintThreshold=bg+noise*faintSigma;

   report(30,"Finding object anchors and faint nebulosity…");
   for(var y=0;y<H;++y)
      for(var x=0;x<W;++x)
      {
         var v=lum.sample(x,y,0),sm=small.sample(x,y,0);
         var mm=medium.sample(x,y,0),lm=large.sample(x,y,0);

         // Core compression: saturating confidence rather than linear brightness.
         var z=(sm-seedThreshold)/Math.max(noise,floor);
         var core=z>0 ? 1-Math.exp(-0.85*z) : 0;
         core=Math.min(0.82,core); // core is an anchor, not a dominant white blob

         // Local-background residuals recover diffuse structure even when its
         // absolute level is far below the bright core.
         var broadZ=(mm-Math.max(bg,lm))/Math.max(noise,floor);
         var broad=Math.max(0,Math.min(1,(broadZ+0.15)/(1.8-1.25*wisps)));
         var absoluteFaint=Math.max(0,Math.min(1,(mm-faintThreshold)/
            Math.max(noise*(2.4-1.2*wisps),floor)));
         var filament=Math.max(0,Math.min(1,(sm-mm)/(2.2*noise)));

         var anchor=Math.max(core,0.70*broad);
         var faint=Math.max(absoluteFaint,0.65*broad,0.45*filament);

         if(suppressStars)
         {
            var spike=Math.max(0,(v-sm)/(3.5*noise));
            if(spike>0.7 && broad<0.35)
            {
               anchor*=0.18;
               faint*=0.25;
            }
         }
         seed.setSample(Math.max(0,Math.min(1,anchor)),x,y,0);
         candidate.setSample(Math.max(0,Math.min(1,faint)),x,y,0);
      }

   // Connected faint-structure growth. This is the important difference from
   // simply lowering a global threshold: faint signal is favored when it is
   // spatially connected to already-confident object structure.
   report(55,"Growing into connected faint wisps…");
   console.writeln("[Smart Mask Perf] Seeds / candidates: "+SmartTools.elapsed(stage));stage=SmartTools.now();
   var grow=new SMEBuffer(seed),spare=new SMEBuffer(seed);
   var iterations=Math.round(2+8*wisps);
   for(var it=0;it<iterations;++it)
   {
      var prev=grow,tmp=spare;for(var cp=0;cp<prev.data.length;cp++)tmp.data[cp]=prev.data[cp];grow=tmp;spare=prev;
      for(var gy=1;gy<H-1;++gy)
         for(var gx=1;gx<W-1;++gx)
         {
            var c=candidate.sample(gx,gy,0);
            if(c<=0.01)continue;
            var n=0;
            for(var dy=-1;dy<=1;++dy)
               for(var dx=-1;dx<=1;++dx)
                  if(dx!=0||dy!=0)n=Math.max(n,prev.sample(gx+dx,gy+dy,0));
            var propagated=n*c*(0.82+0.16*wisps);
            if(propagated>grow.sample(gx,gy,0))
               grow.setSample(propagated,gx,gy,0);
         }

   }

   console.writeln("[Smart Mask Perf] Connected growth: "+SmartTools.elapsed(stage)+"; iterations="+iterations+"; two buffers");stage=SmartTools.now();
   report(80,"Feathering Smart Mask…");
   var feather=SmartMaskEngine.boxMean(grow,mode=="galaxy"?2:3);
   var out=new SMEBuffer(W,H,1);
   for(var fy=0;fy<H;++fy)
      for(var fx=0;fx<W;++fx)
      {
         var m=Math.max(feather.sample(fx,fy,0),
                        0.55*candidate.sample(fx,fy,0)*grow.sample(fx,fy,0));
         // Lift genuine faint membership while keeping the compressed core.
         m=Math.pow(Math.max(0,Math.min(1,m)),0.78);
         out.setSample(Math.min(0.88,m),fx,fy,0);
      }

   lum.free();small.free();medium.free();large.free();
   seed.free();candidate.free();grow.free();feather.free();
   report(100,"Smart Mask ready");
   var mask=new Image(W,H,1);SmartTools.writePlane(mask,out.data,0);
   console.writeln("[Smart Mask Perf] Feather / bulk output: "+SmartTools.elapsed(stage));
   return {mask:mask,mode:mode,background:bg,noise:noise};
};

SmartMaskEngine.robustStats=function(prepared){
 if(prepared.robust)return prepared.robust;
 var W=prepared.width,H=prepared.height,a=prepared.lum.data,v=[],diff=[],step=Math.max(1,Math.ceil(Math.sqrt(W*H/50000)));
 for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step)v.push(a[y*W+x]);
 var cutoff=SmartMaskEngine.percentile(v,.60),bg=SmartMaskEngine.percentile(v,.22);
 for(y=0;y<H-1;y+=step)for(x=0;x<W-1;x+=step){var i=y*W+x;if(a[i]<=cutoff){if(a[i+1]<=cutoff)diff.push(a[i+1]-a[i]);if(a[i+W]<=cutoff)diff.push(a[i+W]-a[i]);}}
 var med=SmartMaskEngine.percentile(diff,.5),dev=[];for(var i=0;i<diff.length;i++)dev.push(Math.abs(diff[i]-med));
 return prepared.robust={bg:bg,median:SmartMaskEngine.percentile(v,.5),noise:Math.max(1e-8,1.4826*SmartMaskEngine.percentile(dev,.5)/Math.sqrt(2)),count:diff.length};
};

SmartMaskEngine.generate=function(src,options,progress){
 options=options||{};if(!options.algorithm)options.algorithm="adaptive";var result=SmartMaskEngine.generateLegacy(src,options,progress);
 result.algorithm=options.algorithm=="legacy"?"legacy":"adaptive";
 console.writeln("[Smart Mask] "+result.algorithm+" background="+result.background+" noise="+result.noise);
 return result;
};

// Embedded SmartStretchAnalysis support.
var SST_FAMILIES=["Quick STF","Conservative black MTF","Zero black MTF","Linked luminance MTF","Linked luminance asinh","Linked luminance log","Linked luminance gamma","Two-stage luminance MTF","Protected luminance MTF"];

var SST_TARGET_MEDIANS=[.12,.16,.20,.25,.30,.35,.40,.45,.50];

var SST_PALETTES=["Broadband RGB","SHO","HOO"];

function SSTDistribution(values){
 if(!values.length)return null;values.sort(function(a,b){return a-b;});
 var median=SSTPercentile(values,.5),d=[];for(var i=0;i<values.length;i++)d.push(Math.abs(values[i]-median));d.sort(function(a,b){return a-b;});
 return {count:values.length,min:values[0],max:values[values.length-1],median:median,robustSpreadSigma:1.4826*SSTPercentile(d,.5),p01:SSTPercentile(values,.01),p05:SSTPercentile(values,.05),p10:SSTPercentile(values,.10),p20:SSTPercentile(values,.20),p90:SSTPercentile(values,.90),p99:SSTPercentile(values,.99),p995:SSTPercentile(values,.995),p999:SSTPercentile(values,.999),p9999:SSTPercentile(values,.9999)};
}

function SSTDescribe(image,scope,limit,progress){
 var W=image.width,H=image.height,C=image.numberOfChannels;if(C!=1&&C!=3)throw new Error("Descriptor requires mono or RGB.");
 var step=Math.max(1,Math.ceil(Math.sqrt(W*H/(limit||200000)))),lum=[],planes=[],rawMin=[],rawMax=[],counts=[],samples=[],cells=[],cols=8,rows=6;
 for(var c=0;c<C;c++){planes.push([]);rawMin.push(Infinity);rawMax.push(-Infinity);counts.push({atOrBelowZero:0,nearSaturation:0,atOrAboveOne:0});}
 for(var i=0;i<cols*rows;i++)cells.push({index:i,column:i%cols,row:Math.floor(i/cols),values:[]});
 var anyNear=0,anyClipped=0,allZero=0;
 for(var y=0;y<H;y+=step){for(var x=0;x<W;x+=step){
  var xx=Math.min(W-1,x+Math.floor(step/2)),yy=Math.min(H-1,y+Math.floor(step/2)),v=[],near=false,clipped=false,zero=true;
  for(c=0;c<C;c++){var z=image.sample(xx,yy,c);if(!isFinite(z))throw new Error("Nonfinite image sample in measurements.");rawMin[c]=Math.min(rawMin[c],z);rawMax[c]=Math.max(rawMax[c],z);if(z<=0)counts[c].atOrBelowZero++;if(z>=.997){counts[c].nearSaturation++;near=true;}if(z>=1-1e-6){counts[c].atOrAboveOne++;clipped=true;}if(z>0)zero=false;v.push(SSTClamp(z,0,1));planes[c].push(v[c]);}
  if(near)anyNear++;if(clipped)anyClipped++;if(zero)allZero++;
  var signal=SSTY(v),index=Math.min(rows-1,Math.floor(yy*rows/H))*cols+Math.min(cols-1,Math.floor(xx*cols/W));lum.push(signal);cells[index].values.push(signal);samples.push({x:xx,y:yy,signal:signal});
 }if(progress&&y%(step*32)==0)progress(y/H);}
 var N=lum.length,distribution=SSTDistribution(lum),channels=[];
 for(c=0;c<C;c++)channels.push({statistics:SSTDistribution(planes[c]),rawMin:rawMin[c],rawMax:rawMax[c],atOrBelowZeroFraction:counts[c].atOrBelowZero/N,nearSaturationFraction:counts[c].nearSaturation/N,atOrAboveOneFraction:counts[c].atOrAboveOne/N});
 var regions=[],regionalMedians=[];for(i=0;i<cells.length;i++){var stats=SSTDistribution(cells[i].values);regions.push({index:i,column:cells[i].column,row:cells[i].row,statistics:stats});if(stats)regionalMedians.push(stats.median);}
 regionalMedians.sort(function(a,b){return a-b;});
 var bg=[],differences=[];for(i=0;i<samples.length;i++){var s=samples[i];if(s.signal<=distribution.p20){bg.push(s.signal);if(s.x<W-1){var next=[],valid=true;for(c=0;c<C;c++){var z=image.sample(s.x+1,s.y,c);if(!isFinite(z)){valid=false;break;}next.push(SSTClamp(z,0,1));}if(valid&&SSTY(next)<=distribution.p20)differences.push(s.signal-SSTY(next));}}}
 var background=SSTDistribution(bg),noise=SSTDistribution(differences),balance=null;
 if(C==3){var sum=channels[0].statistics.median+channels[1].statistics.median+channels[2].statistics.median;balance={channelMedianFractions:sum>1e-12?[channels[0].statistics.median/sum,channels[1].statistics.median/sum,channels[2].statistics.median/sum]:null,redMinusGreenMedian:channels[0].statistics.median-channels[1].statistics.median,blueMinusGreenMedian:channels[2].statistics.median-channels[1].statistics.median};}
 return {schema:"smart-stretch-image-descriptor-1",measurementVersion:1,scope:scope,width:W,height:H,channels:C,bitsPerSample:image.bitsPerSample,sampling:{method:"systematic cell-center samples from supplied image",step:step,sampleCount:N,sampleBudget:limit||200000,statisticsRange:"clamped to 0..1; raw extrema and clipping fractions are recorded separately",highlightPercentilesAreSampleEstimates:true},luminance:distribution,channelStatistics:channels,clipping:{nearSaturationThreshold:.997,clippedThreshold:1-1e-6,anyChannelNearSaturationFraction:anyNear/N,anyChannelClippedFraction:anyClipped/N,allChannelsAtOrBelowZeroFraction:allZero/N},background:{method:"lowest 20 percent of sampled luminance, not a sky-background mask",statistics:background},noise:{method:"robust sigma of adjacent horizontal luminance differences divided by sqrt(2), restricted to low-signal pairs",sigmaEstimate:noise&&noise.count>=16?noise.robustSpreadSigma/Math.sqrt(2):null,pairCount:noise?noise.count:0,caveat:"Heuristic; structure, gradients, correlated pixels and selection bias can affect this estimate."},spatial:{columns:cols,rows:rows,regions:regions,regionalMedianP10:SSTPercentile(regionalMedians,.10),regionalMedianP90:SSTPercentile(regionalMedians,.90)},rgbBalance:balance};
}

function SSTClamp(v,a,b){return Math.max(a,Math.min(b,v));}

function SSTPercentile(a,p){if(!a.length)return 0;var q=p*(a.length-1),i=Math.floor(q),f=q-i;return a[i]*(1-f)+a[Math.min(i+1,a.length-1)]*f;}

function SSTY(v){return v.length==1?v[0]:.2126*v[0]+.7152*v[1]+.0722*v[2];}

function SSTSampleStats(a){a.sort(function(x,y){return x-y;});var m=SSTPercentile(a,.5),d=[];for(var i=0;i<a.length;i++)d.push(Math.abs(a[i]-m));d.sort(function(x,y){return x-y;});return {median:m,sigma:1.3257*SSTPercentile(d,.5),min:a.length?a[0]:0,max:a.length?a[a.length-1]:0,p90:SSTPercentile(a,.9),p99:SSTPercentile(a,.99),count:a.length};}

function SSTMeasure(image){
 var C=image.numberOfChannels;if(C!=1&&C!=3)throw new Error("Use a grayscale or RGB image without alpha channels.");
 var a=[],lum=[],step=Math.max(1,Math.ceil(Math.sqrt(image.width*image.height/60000))),invalid=0;
 for(var c=0;c<C;c++)a.push([]);
 for(var y=0;y<image.height;y+=step)for(var x=0;x<image.width;x+=step){var v=[],valid=true;
  for(c=0;c<C;c++){var z=image.sample(x,y,c);if(!isFinite(z)){valid=false;break;}v.push(SSTClamp(z,0,1));}
  if(!valid){invalid++;continue;}for(c=0;c<C;c++)a[c].push(v[c]);lum.push(SSTY(v));
 }
 if(invalid||!lum.length)throw new Error("The statistical sample contains invalid values or is empty. Repair the source before training.");
 var stats={channels:[],luminance:SSTSampleStats(lum),sampleStep:step,width:image.width,height:image.height};
 for(c=0;c<C;c++)stats.channels.push(SSTSampleStats(a[c]));return stats;
}

function SSTMTF(x,m){if(x<=0)return 0;if(x>=1)return 1;return (1-m)*x/(m+(1-2*m)*x);}

function SSTMidtone(u,t){return SSTClamp((1-t)*u/(t+(1-2*t)*u),1e-8,1-1e-8);}

function SSTBlack(s,k){if(s.max-s.min<=1e-12||s.median>=.5)return 0;return Math.max(0,Math.min(s.median-1e-12,s.median-k*s.sigma));}

function SSTNormalized(v,b){return SSTClamp((v-b)/Math.max(1e-12,1-b),0,1);}

function SSTAsinh(x){return Math.log(x+Math.sqrt(x*x+1));}

function SSTShape(x,method,p){
 x=SSTClamp(x,0,1);if(x==0||x==1)return x;
 if(method=="asinh")return p<1e-8?x:SSTAsinh(p*x)/SSTAsinh(p);
 if(method=="log")return p<1e-8?x:Math.log(1+p*x)/Math.log(1+p);
 if(method=="gamma")return Math.pow(x,p);
 return SSTMTF(x,p);
}

function SSTSolvedShape(u,t,method){
 u=SSTClamp(u,1e-12,1-1e-12);
 if(method=="gamma")return SSTClamp(Math.log(t)/Math.log(u),.02,10);
 if(method=="mtf")return SSTMidtone(u,t);
 // Asinh/log are lifting curves only. Their finite parameter range is recorded.
 if(t<=u)return 0;
 var lo=0,hi=1e12;for(var i=0;i<90;i++){var m=(lo+hi)/2;if(SSTShape(u,method,m)<t)lo=m;else hi=m;}return (lo+hi)/2;
}

function SSTBuildRecipe(family,variant,stats){
 var t=SST_TARGET_MEDIANS[variant],p={id:"f"+family+"v"+variant,family:family,variant:variant,target:t,black:[],shape:[],method:"mtf",second:0,baseline:family==0&&variant==3};
 if(family<3){var k=family==0?2.8:4.5;
  for(var c=0;c<stats.channels.length;c++){var s=stats.channels[c],b=family==2?0:SSTBlack(s,k),m=.5;
   if(s.max-s.min>1e-12&&s.median<.5)m=SSTMidtone(SSTClamp(SSTNormalized(s.median,b),1e-12,1-1e-12),t);
   p.black.push(b);p.shape.push(m);
  }
 }else{var ls=stats.luminance,b=0,u=SSTClamp(ls.median,1e-12,1-1e-12);p.black=[b];
  p.method=family==4?"asinh":family==5?"log":family==6?"gamma":"mtf";
  if(family==7){var first=Math.min(t,.20);p.shape=[SSTSolvedShape(u,first,"mtf")];p.second=SSTMidtone(first,Math.min(.8,t+.10));}
  else if(family==8)p.shape=[SSTSolvedShape(SSTClamp(u/.7,1e-12,1-1e-12),Math.min(.95,t/.7),"mtf")];
  else p.shape=[SSTSolvedShape(u,t,p.method)];
 }return p;
}

function SSTHDRAssessment(source){
 var a={version:2,eligible:false,extendedCoreSamples:0,tailToMedian:0,
  tailToNebula:0,coreToNebula:0,coreFraction:0,reason:"No concentrated bright core"};
 if(!source)return a;
 if(source.structure&&source.structure.type=="starField"){a.reason="Dispersed stellar peaks; nebular HDR protection is inappropriate";return a;}
 var l=source.luminance,points=source.corePoints||[],bg=l.p20;
 var nebula=Math.max(1e-8,l.p90-bg),core=[];
 for(var i=0;i<points.length;i++)core.push(points[i].signal);core.sort(function(x,y){return x-y;});
 a.extendedCoreSamples=points.length;a.tailToMedian=l.p999/Math.max(1e-8,l.median);
 a.tailToNebula=Math.max(0,l.p999-bg)/nebula;
 a.coreToNebula=core.length?Math.max(0,SSTPercentile(core,.5)-bg)/nebula:0;
 var step=Math.max(1,Math.ceil(Math.sqrt(source.width*source.height/240000)));
 a.coreFraction=points.length/(Math.ceil(source.width/step)*Math.ceil(source.height/step));
 // Require spatial support, a small footprint AND strong separation from the
 // ordinary nebula. Broad signal and isolated bright stars are insufficient.
 a.eligible=points.length>=12&&a.coreFraction>=.0005&&a.coreFraction<=.035&&
  a.tailToMedian>=12&&a.tailToNebula>=10&&a.coreToNebula>=6;
 if(a.eligible)a.reason="Concentrated extended core far brighter than surrounding nebula";
 return a;
}

function SSTHDRRecipe(source,variant,group){
 var d=source.luminance,b=d.p05,span=Math.max(1e-8,d.p90-b);
 var knee=SSTClamp(b+span*(1.5+.5*(variant%3)),b+1e-7,.95);
 return {version:2,coreContrast:[.25,.50,.75][group%3],saturation:[0,.10,.20][Math.floor(group/3)],background:b,backgroundOutput:[.035,.06,.085][group%3],
  knee:knee,kneeOutput:[.36,.43,.50][variant%3],ceiling:[.88,.92,.96][Math.floor(variant/3)],
  lowShape:[1,3,8][Math.floor(variant/3)],highShape:Math.max(1,(1-knee)/Math.max(1e-8,knee-b))};
}

function SSTHDRValue(peak,h){
 if(peak<=h.background)return h.background>1e-12?h.backgroundOutput*peak/h.background:0;
 if(peak<=h.knee){var t=(peak-h.background)/(h.knee-h.background);
  return h.backgroundOutput+(h.kneeOutput-h.backgroundOutput)*SSTAsinh(h.lowShape*t)/SSTAsinh(h.lowShape);}
 var t=(peak-h.knee)/(1-h.knee);
 var q=Math.log(1+h.highShape*t)/Math.log(1+h.highShape);
 // Monotonic S curve expands central shoulder contrast without moving endpoints.
 var contrast=SSTOptional(h,"coreContrast",0);q+=contrast*q*(1-q)*(2*q-1);
 return h.kneeOutput+(h.ceiling-h.kneeOutput)*q;
}

function SSTPixel(values,p){
 var v=[],i;for(i=0;i<values.length;i++){if(!isFinite(values[i]))throw new Error("Nonfinite source sample encountered.");v.push(SSTClamp(values[i],0,1));}
 var h=SSTOptional(p,"hdr",null);
 if(h){var peak=0;for(i=0;i<v.length;i++)peak=Math.max(peak,v[i]);if(peak<=1e-12)return v;
  var mapped=SSTHDRValue(peak,h),gain=mapped/peak;for(i=0;i<v.length;i++)v[i]=v[i]*gain;
  var saturation=SSTOptional(h,"saturation",0);
  if(v.length==3&&saturation>0){var lum=SSTY(v),weight=SSTSmooth((peak-h.background)/Math.max(1e-8,h.knee-h.background));
   var amount=1+saturation*weight;
   // Bound the saturation factor, rather than clipping RGB: luminance stays fixed.
   for(i=0;i<3;i++){var delta=v[i]-lum;if(delta>0)amount=Math.min(amount,(h.ceiling-lum)/delta);else if(delta<0)amount=Math.min(amount,-lum/delta);}
   amount=Math.max(1,amount);for(i=0;i<3;i++)v[i]=lum+amount*(v[i]-lum);
  }return v;}
 if(p.selectiveMidtone!==undefined){var peak=0;for(i=0;i<v.length;i++)peak=Math.max(peak,v[i]);if(peak<=1e-12)return v;
  var knee=p.selectiveKnee,kneeOutput=SSTMTF(knee,p.selectiveMidtone),mapped;
  if(peak<=knee)mapped=SSTMTF(peak,p.selectiveMidtone);
  else{var q=Math.log(1+(peak-knee)/Math.max(1e-8,knee))/Math.log(1+(1-knee)/Math.max(1e-8,knee));mapped=kneeOutput+(p.selectiveCeiling-kneeOutput)*q;}
  var gain=mapped/peak;for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;}
 if(p.hdrShape!==undefined){var peak=0;for(i=0;i<v.length;i++)peak=Math.max(peak,v[i]);
  if(peak<=1e-12)return v;var mapped=.92*SSTShape(peak,"log",p.hdrShape),gain=mapped/peak;
  for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;}
 if(p.family<3){for(i=0;i<v.length;i++)v[i]=SSTMTF(SSTNormalized(v[i],p.black[i]),p.shape[i]);return v;}
 var y=SSTY(v);if(y<=1e-12)return v;
 var z=SSTShape(SSTNormalized(y,p.black[0]),p.method,p.shape[0]);
 if(p.family==7){var lift=SSTMTF(z,p.second),weight=4*z*(1-z);z=z+(lift-z)*weight;}
 if(p.family==8)z=y>=.7?y:.7*SSTMTF(y/.7,p.shape[0]);
 var mx=0;for(i=0;i<v.length;i++)mx=Math.max(mx,v[i]);
 if(SSTOptional(p,"luminanceGamut",false)){
  // Preserve the requested luminance; compress chroma only when RGB would
  // leave the display gamut. This avoids dark nuclei at channel saturation.
  var requested=SSTClamp(z,0,1),factor=requested/y,chroma=1;
  for(i=0;i<v.length;i++){var delta=v[i]*factor-requested;if(delta>0)chroma=Math.min(chroma,(1-requested)/delta);else if(delta<0)chroma=Math.min(chroma,-requested/delta);}
  chroma=SSTClamp(chroma,0,1);for(i=0;i<v.length;i++)v[i]=SSTClamp(requested+chroma*(v[i]*factor-requested),0,1);return v;
 }
 var gain=Math.min(z/y,1/Math.max(mx,1e-12));
 for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;
}

function SSTSmooth(t){t=SSTClamp(t,0,1);return t*t*(3-2*t);}

function SSTBoxMean(image,radius,signalAt)
{
      var W=image.width,H=image.height;
      var stride=W+1;
      var integral=new Array((W+1)*(H+1));
      for(var z=0;z<integral.length;++z)integral[z]=0;
      for(var y=0;y<H;++y)
      {
         var row=0;
         for(var x=0;x<W;++x)
         {
            row+=signalAt(image,x,y);
            integral[(y+1)*stride+(x+1)]=
               integral[y*stride+(x+1)]+row;
         }
      }
      var mean=new Image(W,H,1);
      for(var yy=0;yy<H;++yy)
         for(var xx=0;xx<W;++xx)
         {
            var x0=Math.max(0,xx-radius),x1=Math.min(W-1,xx+radius);
            var y0=Math.max(0,yy-radius),y1=Math.min(H-1,yy+radius);
            var A=integral[y0*stride+x0];
            var B=integral[y0*stride+(x1+1)];
            var C=integral[(y1+1)*stride+x0];
            var D=integral[(y1+1)*stride+(x1+1)];
            mean.setSample((D-B-C+A)/((x1-x0+1)*(y1-y0+1)),xx,yy,0);
         }
      return mean;
}

function SSTContrastMap(src){var proxy=new Image(src),mean=null,second=null,map=null;
      var signal=function(im,x,y){return im.numberOfChannels<3?im.sample(x,y,0):.2126*im.sample(x,y,0)+.7152*im.sample(x,y,1)+.0722*im.sample(x,y,2);};
      try{if(proxy.width>640||proxy.height>380)proxy.resample(Math.min(640/proxy.width,380/proxy.height));
         var W=proxy.width,H=proxy.height;mean=SSTBoxMean(proxy,12,signal);
         second=SSTBoxMean(proxy,12,function(im,x,y){var v=signal(im,x,y);return v*v;});
         var deviations=[];for(var y=0;y<H;y+=4)for(var x=0;x<W;x+=4)deviations.push(Math.abs(signal(proxy,x,y)-.25*(signal(proxy,Math.max(0,x-1),y)+signal(proxy,Math.min(W-1,x+1),y)+signal(proxy,x,Math.max(0,y-1))+signal(proxy,x,Math.min(H-1,y+1)))));
         deviations.sort(function(a,b){return a-b;});var noise=Math.max(.0005,1.3257*SSTPercentile(deviations,.5));
         map=new Image(mean);
         for(var y=0;y<H;y++)for(var x=0;x<W;x++){
            var v=signal(proxy,x,y),m=mean.sample(x,y,0),detail=v-m,sd=Math.sqrt(Math.max(0,second.sample(x,y,0)-m*m));
            var lowContrast=1-SSTSmooth((sd/(m+.02)-.08)/.22);
            var confidence=SSTSmooth((Math.abs(detail)/noise-1)/2);
            var bright=proxy.numberOfChannels<3?v:Math.max(proxy.sample(x,y,0),proxy.sample(x,y,1),proxy.sample(x,y,2));
            var weight=lowContrast*confidence*(1-SSTSmooth((bright-.55)/.30))*SSTSmooth((m-.005)/.04);
            var target=v+Math.max(-.08,Math.min(.08,.75*weight*detail));
            var gain=v>1e-8?Math.max(0,Math.min(1/Math.max(1e-8,bright),target/v)):1;
            if(weight<=0||bright>=.85)gain=1;map.setSample(gain,x,y,0);
         }return map;
      }catch(e){if(map)map.free();throw e;}finally{proxy.free();if(mean)mean.free();if(second)second.free();}
   }

function SSTMapGain(map,x,y,W,H){var px=Math.max(0,Math.min(map.width-1,(x+.5)*map.width/W-.5)),py=Math.max(0,Math.min(map.height-1,(y+.5)*map.height/H-.5));
      var ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(ix+1,map.width-1),jy=Math.min(iy+1,map.height-1),fx=px-ix,fy=py-iy;
      return (1-fy)*((1-fx)*map.sample(ix,iy,0)+fx*map.sample(jx,iy,0))+fy*((1-fx)*map.sample(ix,jy,0)+fx*map.sample(jx,jy,0));
   }

function SSTQuickFinish(image,p,progress){var out=null,map=null;
 function report(f,stage){if(progress)progress(f,stage);}
 try{
  if(p.linear){report(0,"Measuring full-resolution endpoints…");var lo=Infinity,hi=-Infinity;
   for(var c=0;c<image.numberOfChannels;c++){image.selectedChannel=c;lo=Math.min(lo,image.minimum());hi=Math.max(hi,image.maximum());}image.resetSelections();
   if(hi-lo>1e-12)for(var y=0;y<image.height;y++){for(var x=0;x<image.width;x++)for(c=0;c<image.numberOfChannels;c++)image.setSample(SSTClamp((image.sample(x,y,c)-lo)/(hi-lo),0,1),x,y,c);
    if(y%32==0)report(.4*(y+1)/image.height,"Applying linked endpoints…");}
  }
  if(p.contrast>0){report(.4,"Building contrast map…");map=SSTContrastMap(image);out=new Image(image);
   for(var y=0;y<image.height;y++){for(var x=0;x<image.width;x++){
    var maxv=0;for(var c=0;c<image.numberOfChannels;c++)maxv=Math.max(maxv,image.sample(x,y,c));
    var gain=maxv>=.85?1:Math.min(Math.max(0,1+p.contrast*(SSTMapGain(map,x,y,image.width,image.height)-1)),1/Math.max(1e-8,maxv));
    for(c=0;c<image.numberOfChannels;c++)out.setSample(image.sample(x,y,c)*gain,x,y,c);
   }if(y%32==0)report(.4+.6*(y+1)/image.height,"Applying full-resolution contrast…");}report(1,"Finishing adjustments complete");return out;
  }report(1,"Finishing adjustments complete");return image;
 }catch(e){if(out)out.free();throw e;}finally{if(map)map.free();}
}

function SSTCompactProtection(source,reference){
 if(!reference||!SSTOptional(reference,"compactSignal",false)||SSTHDRAssessment(reference).eligible)return null;
 var anchors=[],C=source.numberOfChannels,points=reference.signalPoints;
 for(var c=0;c<C;c++){var values=[];for(var i=0;i<points.length;i++)values.push(source.sample(points[i].x,points[i].y,c));values.sort(function(a,b){return a-b;});anchors.push(SSTPercentile(values,.90));}
 return {version:1,anchors:anchors,ceiling:.78};
}

function SSTProtectCompactRecipe(p,stats){
 var guard=SSTOptional(stats,"compactProtection",null);
 if(!guard||p.quick||p.family>1||SSTOptional(p,"hdr",null))return;
 if(guard.version!==1||!(guard.anchors instanceof Array)||guard.anchors.length!=stats.channels.length||guard.ceiling!==.78)throw new Error("Invalid compact protection measurements.");
 for(var gi=0;gi<guard.anchors.length;gi++)if(typeof guard.anchors[gi]!="number"||!isFinite(guard.anchors[gi])||guard.anchors[gi]<0||guard.anchors[gi]>1)throw new Error("Invalid compact signal anchor.");
 for(var c=0;c<p.shape.length;c++){
  var u=SSTNormalized(guard.anchors[c],p.black[c]),target=Math.pow(guard.ceiling,1/(p.finishGamma||1));
  if(u>0&&u<1)p.shape[c]=Math.max(p.shape[c],SSTMidtone(u,target));
 }
 p.compactProtected=true;
}

function SSTObjectQuality(values,compact){
 if(values.length<12)return null;
 var median=SSTPercentile(values,.5),p10=SSTPercentile(values,.10),range=SSTPercentile(values,.90)-p10;
 var washed=compact?(median>.85&&range<.15||p10>.90):(median>.94&&range<.08);
 // Soft compression cost begins before literal saturation: a bright,
 // narrow tonal range can look washed out despite no clipped pixels.
 var compression=compact?24*SSTClamp((median-.68)/.17,0,1)*SSTClamp((.20-range)/.20,0,1):0;
 return {median:median,p10:p10,p90MinusP10:range,washedOut:washed,compressionPenalty:compression,
  penalty:(washed?60+40*SSTClamp((median-.85)/.15,0,1):0)+compression};
}

function SSTEndpointSamples(source){
 var a=[],step=Math.max(1,Math.ceil(Math.sqrt(source.width*source.height/12000)));
 for(var y=0;y<source.height;y+=step)for(var x=0;x<source.width;x+=step)
  for(var c=0;c<source.numberOfChannels;c++)a.push(source.sample(x,y,c));return a;
}

function SSTEndpointValue(value,p){var e=SSTOptional(p,"endpoints",null);
 return e?SSTClamp((value-e.black)/(e.white-e.black),0,1):value;}

function SSTFitEndpoints(p,samples,C){
 if(p.quick||p.stellarCalibration||!samples)return;
 var values=[],luminance=[];
 for(var k=0;k<samples.length;k+=C){var v=SSTPixel(samples.slice(k,k+C),p);
  for(var c=0;c<C;c++){v[c]=Math.pow(v[c],p.finishGamma||1);values.push(v[c]);}luminance.push(SSTY(v));}
 values.sort(function(a,b){return a-b;});luminance.sort(function(a,b){return a-b;});
 var bg=SSTPercentile(luminance,.20),lo=SSTPercentile(values,.0001),hi=values[values.length-1],span=hi-bg;
 // Skip well-placed images, flat/no-signal images and deliberately protected HDR.
 if(span<.025||!(bg>.12||hi<.78&&bg>.035))return;
 var white=Math.min(1,hi+.30*span),black=Math.max(0,Math.min(lo,bg-.045*(white-bg)/.955));
 if(white-black<.04)return;
 p.endpoints={version:1,black:black,white:white,method:"linked sampled bounds with highlight margin and conservative background anchor"};
}

function SSTProcess(source,p,progress){
 function report(f,stage){if(progress)progress(f,stage);}
 report(0,"Preparing full-resolution buffer…");
 var out=new Image(source);out.resetSelections();var C=source.numberOfChannels;
 try{for(var y=0;y<source.height;y++){for(var x=0;x<source.width;x++){var v=[];for(var c=0;c<C;c++)v.push(source.sample(x,y,c));v=SSTPixel(v,p);if(!p.quick)v=SSTFinishedValues(v,p);for(c=0;c<C;c++)out.setSample(v[c],x,y,c);}
  if(y%32==0)report(.70*(y+1)/source.height,"Stretching full-resolution pixels…");
 }if(!p.quick){report(1,"Stretch complete");return out;}report(.70,"Finishing stretch…");
 if(p.quick){var finished=SSTQuickFinish(out,p,function(f,stage){report(.70+.20*f,stage);});if(finished!==out){out.free();out=finished;}}
 report(.90,"Applying final brightness…");
 if(p.finishGamma!==undefined&&p.finishGamma!=1)for(var y=0;y<out.height;y++){for(var x=0;x<out.width;x++)for(var c=0;c<C;c++)out.setSample(Math.pow(SSTClamp(out.sample(x,y,c),0,1),p.finishGamma),x,y,c);
  if(y%32==0)report(.90+.10*(y+1)/out.height,"Applying final brightness…");}
 var endpoints=SSTOptional(p,"endpoints",null);
 if(endpoints)for(var ey=0;ey<out.height;ey++){for(var ex=0;ex<out.width;ex++)for(var ec=0;ec<C;ec++)out.setSample(SSTEndpointValue(out.sample(ex,ey,ec),p),ex,ey,ec);
  if(ey%32==0)report(.99,"Applying saved black/white endpoints…");}
 if(SSTOptional(p,"objectLift",null))for(var oy=0;oy<out.height;oy++){for(var ox=0;ox<out.width;ox++){var v=[];for(var oc=0;oc<C;oc++)v.push(out.sample(ox,oy,oc));v=SSTObjectLift(v,p);for(oc=0;oc<C;oc++)out.setSample(v[oc],ox,oy,oc);}
  if(oy%32==0)report(.99,"Balancing compact-object brightness…");}
 if(SSTOptional(p,"finishRefinements",null))for(var fy=0;fy<out.height;fy++){for(var fx=0;fx<out.width;fx++){var fv=[];for(var fc=0;fc<C;fc++)fv.push(out.sample(fx,fy,fc));fv=SSTRefineFinished(fv,p);for(fc=0;fc<C;fc++)out.setSample(fv[fc],fx,fy,fc);}
  if(fy%32==0)report(.995,"Applying bounded refinement…");}

 report(1,"Stretch complete");return out;}catch(e){out.free();throw e;}
}

function SSTStellarRecipe(image,reference,v,group){
 var points=reference.structure.stellarPoints,peaks=[],C=image.numberOfChannels;
 for(var i=0;i<points.length;i++){var peak=0;for(var c=0;c<C;c++)peak=Math.max(peak,image.sample(points[i].x,points[i].y,c));peaks.push(peak);}
 peaks.sort(function(a,b){return a-b;});var bg=Math.max(0,reference.luminance.p20),anchor=Math.max(bg+1e-8,SSTPercentile(peaks,.5));
 return {version:2,coreContrast:0,saturation:0,background:bg,backgroundOutput:.001,
  knee:Math.min(.95,anchor),kneeOutput:.38+.035*v+.012*(group-4),ceiling:.92+.02*(group%3),lowShape:1+(group%3),highShape:Math.max(1,Math.min(1e12,(1-anchor)/Math.max(1e-8,anchor-bg)))};
}

function SSTCandidates(stats,seed,source,target,preferenceModel,palette){
 palette=palette||"Broadband RGB";if(SST_PALETTES.indexOf(palette)<0)throw new Error("Unknown palette.");
 var names=["Restrained background","Balanced signal","Faint-signal emphasis","Highlight detail","Color preservation","Midtone contrast","Gentle stretch","Bright structure","Wide signal range"],a=[];
 var noise=stats.luminance.sigma/Math.max(1e-8,stats.luminance.median);
 var center=target=="Faint filaments / Spaghetti"?.30:target=="Galaxy"?.20:.25;
 center=SSTClamp(center-.025*SSTClamp(noise,0,2),.16,.30);
 var offsets=[-.09,0,.09,-.03,.02,.04,-.06,.06,-.01];
 var families=[1,3,4,8,0,7,6,5,2];

 var hdrSource=source?SSTQualitySource(source):null;
 var assessment=SSTHDRAssessment(hdrSource),hdrEligible=assessment.eligible;
 stats.hdrAssessment=assessment;stats.detectedStructure=hdrSource?SSTCopy(hdrSource.structure):null;
 var protection=SSTCompactProtection(source,hdrSource);if(protection)stats.compactProtection=protection;
 for(var group=0;group<9;group++)for(var v=0;v<9;v++){
  var f=families[(group+v)%9],p=SSTBuildRecipe(f,v,stats);
  p.id="f"+f+"v"+v;p.scenario=names[group];
  // One untouched default Quick baseline is always present.
  if(f==0&&v==3){p=SSTBuildRecipe(0,3,stats);p.quick=true;p.linear=true;p.contrast=1;p.scenario="Current Quick baseline";}
  else{p.baseline=false;var desired=SSTClamp(center+offsets[group]+(v%3-1)*.035,.08,.48);
   p.finishGamma=SSTClamp(Math.log(desired)/Math.log(Math.max(.001,p.target)),.35,2.8);p.target=desired;}
  if(!p.quick&&(f==8||f==5)&&source){
   p.selectiveMidtone=SSTMidtone(Math.max(1e-8,stats.luminance.median),SSTClamp(.27+(v%3-1)*.035,.20,.36));
   p.selectiveKnee=SSTClamp(SSTMTF(.60,1-p.selectiveMidtone),1e-7,.9);p.selectiveCeiling=.90+(v%3)*.025;
   p.finishGamma=1;p.scenario="Faint signal + selective highlight shoulder";
  }
  if(hdrEligible&&!p.quick&&(hdrSource.structure&&hdrSource.structure.type=="galaxy"?v%3==0:v%3!=2)){
   delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;
   p.hdr=SSTHDRRecipe(hdrSource,v,group);if(hdrSource.structure.type=="extended"){p.hdr.kneeOutput=[.44,.52,.60][v%3];}p.finishGamma=1;p.scenario="Source-aware HDR balance";
  }
  if(preferenceModel&&!p.quick){var one=[p];SSTPersonalizeCandidates(one,stats,preferenceModel,group);p=one[0];}
  SSTProtectCompactRecipe(p,stats);
  if(protection&&!p.quick&&[3,4,7,8].indexOf(p.family)>=0)p.objectTarget=[.52,.59,.66][v%3];
  if(source&&!p.quick&&hdrSource.structure.type=="starField"){
   delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;delete p.objectTarget;delete p.objectLift;
   p.hdr=SSTStellarRecipe(source,hdrSource,v,group);p.finishGamma=1;p.stellarCalibration=true;p.scenario="Stellar brightness and color balance";
  }
  if(source&&!p.quick&&hdrSource.structure.type=="galaxy"&&p.family>=3&&!p.hdr)p.luminanceGamut=true;
  if(source&&!p.quick&&hdrSource.structure.type=="galaxy"&&!p.hdr&&v%3==1){p.finishRefinements=[{mode:3,strength:.12}];p.scenario="Galaxy central shoulder lift";}
  if(source&&!p.quick&&hdrSource.structure.type=="extended"&&hdrEligible&&!p.hdr){p.highlightShoulder=.88;p.scenario="Extended nebula with gentle peak protection";}
  if(palette=="SHO"&&!p.quick&&stats.channels.length==3){p.shoRedLift=[0,.08,.16][v%3];if(!p.hdr&&p.family>=3)p.luminanceGamut=true;}
  if(source&&!p.quick)p.pendingPreparation=true;
  a.push(p);
 }return a;
}

function SSTFinishedValues(v,p){
 var a=[];for(var c=0;c<v.length;c++)a.push(SSTEndpointValue(Math.pow(v[c],p.finishGamma||1),p));
 if(p.highlightShoulder!==undefined){var peak=Math.max.apply(null,a),k=p.highlightShoulder;if(peak>k){var mapped=k+(.98-k)*(1-Math.exp(-(peak-k)/(.98-k))),gain=mapped/peak;for(c=0;c<a.length;c++)a[c]*=gain;}}
 a=SSTRefineFinished(SSTObjectLift(a,p),p);
 if(a.length==3&&SSTOptional(p,"shoRedLift",0)>0){var lum=SSTY(a);a[0]+=p.shoRedLift*a[0]*(1-a[0])*4*lum*(1-lum);}
 return a;
}

function SSTObjectLift(v,p){
 var h=SSTOptional(p,"objectLift",null);if(!h)return v;
 var peak=0;for(var c=0;c<v.length;c++)peak=Math.max(peak,v[c]);if(peak<=h.background||peak<=1e-12)return v;
 var u=(peak-h.background)/(1-h.background),mapped=h.background+(1-h.background)*SSTMTF(u,h.midtone),gain=mapped/peak;
 for(c=0;c<v.length;c++)v[c]*=gain;return v;
}

function SSTPrepareGrid(session,source,progress){
 var grid=SSTGrid(session),pending=false;
 for(var i=0;i<grid.length;i++)if(SSTOptional(grid[i],"pendingPreparation",false))pending=true;
 if(!pending)return;
 var samples=SSTEndpointSamples(source),probes=SSTPreviewSamples(source),reference=SSTQualitySource(source),accepted=[],C=source.numberOfChannels;
 for(i=0;i<grid.length;i++){var p=grid[i];if(progress)progress(i,grid.length);
  if(SSTOptional(p,"pendingPreparation",false)){
   SSTFitEndpoints(p,samples,C);
   var target=SSTOptional(p,"objectTarget",null);
   if(target!==null){var peaks=[],background=[];
    for(var k=0;k<samples.length;k+=C){var out=SSTFinishedValues(SSTPixel(samples.slice(k,k+C),p),p);background.push(SSTY(out));}
    background.sort(function(a,b){return a-b;});var bg=SSTPercentile(background,.20);
    for(k=0;k<reference.signalPoints.length;k++){var point=reference.signalPoints[k],v=[];for(var c=0;c<C;c++)v.push(source.sample(point.x,point.y,c));var out=SSTFinishedValues(SSTPixel(v,p),p);peaks.push(Math.max.apply(null,out));}
    peaks.sort(function(a,b){return a-b;});var anchor=SSTPercentile(peaks,.5);
    if(peaks.length>=12&&anchor>bg+1e-6&&anchor<target){var u=(anchor-bg)/(1-bg),t=(target-bg)/(1-bg);p.objectLift={version:1,background:bg,midtone:SSTMidtone(u,t)};}
   }
   delete p.pendingPreparation;
  }
  var signature=[];for(var k=0;k<probes.length;k+=C){var v=SSTFinishedValues(SSTPixel(probes.slice(k,k+C),p),p);for(var c=0;c<C;c++)signature.push(v[c]);}
  var duplicate=false;for(k=0;k<accepted.length;k++)if(SSTRegionDifference(signature,accepted[k],C)<.008){duplicate=true;break;}
  if(!p.quick)p.duplicateUnresolved=duplicate;accepted.push(signature);
 }
}

function SSTRegionDifference(a,b,C){
 var sum=0,regions=[],counts=[];for(var r=0;r<12;r++){regions[r]=0;counts[r]=0;}
 for(var k=0;k<a.length;k++){var d=a[k]-b[k],pixel=Math.floor(k/C),x=pixel%30,y=Math.floor(pixel/30),r=Math.min(2,Math.floor(y*3/20))*4+Math.min(3,Math.floor(x*4/30));sum+=d*d;regions[r]+=d*d;counts[r]++;}
 var local=0;for(r=0;r<12;r++)local=Math.max(local,Math.sqrt(regions[r]/Math.max(1,counts[r])));
 return Math.max(Math.sqrt(sum/Math.max(1,a.length)),local*.6);
}

var SSTSourceCacheImage=null,SSTSourceCacheValue=null;

function SSTStructure(image,reference){
 // Measure spatial shape independently of the object's name and brightness.
 var scale=Math.max(1,Math.ceil(Math.max(image.width,image.height)/600)),W=Math.ceil(image.width/scale),H=Math.ceil(image.height/scale),N=W*H,C=image.numberOfChannels,a=[],sum=[],smooth=[],peaks=[],i,x,y;
 function at(xx,yy){return a[Math.max(0,Math.min(H-1,yy))*W+Math.max(0,Math.min(W-1,xx))];}
 for(y=0;y<H;y++)for(x=0;x<W;x++){var xx=Math.min(image.width-1,x*scale),yy=Math.min(image.height-1,y*scale);a.push(C==1?image.sample(xx,yy,0):.2126*image.sample(xx,yy,0)+.7152*image.sample(xx,yy,1)+.0722*image.sample(xx,yy,2));}
 for(i=0;i<(W+1)*(H+1);i++)sum[i]=0;
 for(y=0;y<H;y++)for(x=0;x<W;x++)sum[(y+1)*(W+1)+x+1]=a[y*W+x]+sum[y*(W+1)+x+1]+sum[(y+1)*(W+1)+x]-sum[y*(W+1)+x];
 function mean(xx,yy,r){var x0=Math.max(0,xx-r),x1=Math.min(W,xx+r+1),y0=Math.max(0,yy-r),y1=Math.min(H,yy+r+1);return (sum[y1*(W+1)+x1]-sum[y0*(W+1)+x1]-sum[y1*(W+1)+x0]+sum[y0*(W+1)+x0])/((x1-x0)*(y1-y0));}
 var sorted=a.slice().sort(function(u,v){return u-v;}),bg=SSTPercentile(sorted,.2),tail=Math.max(1e-10,SSTPercentile(sorted,.999)-bg),residual=[];
 for(y=0;y<H;y++)for(x=0;x<W;x++){smooth.push(mean(x,y,8));residual.push(Math.abs(at(x,y)-mean(x,y,1)));}
 residual.sort(function(u,v){return u-v;});var noise=SSTPercentile(residual,.5),cut=Math.max(noise*8,tail*.01);
 for(y=2;y<H-2;y++)for(x=2;x<W-2;x++){var v=at(x,y);if(v-bg<Math.max(noise*8,tail*.02)||v-mean(x,y,2)<cut)continue;var maximum=true;for(var dy=-2;dy<=2&&maximum;dy++)for(var dx=-2;dx<=2;dx++)if(at(x+dx,y+dy)>v){maximum=false;break;}if(maximum)peaks.push({x:x,y:y});}
 var ss=smooth.slice().sort(function(u,v){return u-v;}),threshold=bg+.15*Math.max(1e-10,SSTPercentile(ss,.999)-bg),seen=[],largest=[];
 for(i=0;i<N;i++){if(seen[i]||smooth[i]<=threshold)continue;var queue=[i];seen[i]=true;for(var q=0;q<queue.length;q++){var z=queue[q],zx=z%W,zy=Math.floor(z/W),neighbors=[];if(zx>0)neighbors.push(z-1);if(zx<W-1)neighbors.push(z+1);if(zy>0)neighbors.push(z-W);if(zy<H-1)neighbors.push(z+W);for(var k=0;k<neighbors.length;k++){var n=neighbors[k];if(!seen[n]&&smooth[n]>threshold){seen[n]=true;queue.push(n);}}}if(queue.length>largest.length)largest=queue;}
 var cx=0,cy=0;for(i=0;i<largest.length;i++){cx+=largest[i]%W;cy+=Math.floor(largest[i]/W);}cx/=Math.max(1,largest.length);cy/=Math.max(1,largest.length);
 var xx2=0,yy2=0,xy=0;for(i=0;i<largest.length;i++){x=largest[i]%W-cx;y=Math.floor(largest[i]/W)-cy;xx2+=x*x;yy2+=y*y;xy+=x*y;}var trace=xx2+yy2,delta=Math.sqrt((xx2-yy2)*(xx2-yy2)+4*xy*xy),axis=Math.sqrt((trace+delta)/Math.max(1e-8,trace-delta)),r=.15*Math.min(W,H),central=0;
 for(i=0;i<peaks.length;i++)if(Math.pow(peaks[i].x-cx,2)+Math.pow(peaks[i].y-cy,2)<r*r)central++;
 var concentration=central/Math.max(1,peaks.length)/(Math.PI*r*r/N),fraction=largest.length/N,type="extended";
 if(peaks.length>=100&&axis>=1.8&&fraction>=.004)type="galaxy";
 else if(peaks.length>=150&&concentration>=3&&axis<1.5&&fraction>=.004&&fraction<.035)type="cluster";
 else if(peaks.length>=100&&concentration<2&&fraction<.01)type="starField";
 var stellarPoints=[];for(i=0;i<peaks.length;i+=Math.max(1,Math.ceil(peaks.length/300)))stellarPoints.push({x:peaks[i].x*scale,y:peaks[i].y*scale});
 var diskPoints=[],outerPoints=[],regionStep=Math.max(1,Math.ceil(Math.sqrt(N/6000))),broadSpan=Math.max(1e-10,SSTPercentile(ss,.999)-bg);
 for(y=0;y<H;y+=regionStep)for(x=0;x<W;x+=regionStep){var excess=smooth[y*W+x]-bg;if(excess<Math.max(5*noise,broadSpan*.008))continue;var point={x:x*scale,y:y*scale};if(excess<broadSpan*.08)outerPoints.push(point);else if(excess<broadSpan*.65)diskPoints.push(point);}
 return {version:2,type:type,diskPoints:diskPoints,outerPoints:outerPoints,stellarPoints:stellarPoints,peakCount:peaks.length,centralConcentration:concentration,axisRatio:axis,extendedFraction:fraction};
}

function SSTQualitySource(image){
 if(SSTSourceCacheImage===image&&SSTSourceCacheValue)return SSTSourceCacheValue;
 var value=SSTQualitySourceUncached(image);value.backgroundPoints=SSTBackgroundPoints(image);value.channelHighlights=SSTChannelHighlightSource(image,value);value.structure=SSTStructure(image,value);SSTSourceCacheImage=image;SSTSourceCacheValue=value;return value;
}

function SSTQualitySourceUncached(image){
 var d=SSTDescribe(image,"quality reference preview",12000),values=[],points=[],C=image.numberOfChannels,W=image.width,H=image.height;
 function yAt(x,y){return C==1?image.sample(x,y,0):.2126*image.sample(x,y,0)+.7152*image.sample(x,y,1)+.0722*image.sample(x,y,2);}
 var step=Math.max(1,Math.ceil(Math.sqrt(W*H/240000)));
 for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step)values.push(yAt(x,y));values.sort(function(a,b){return a-b;});
 var signalPoints=[],signalStep=Math.max(1,Math.ceil(Math.sqrt(W*H/24000))),low=SSTPercentile(values,.40),high=SSTPercentile(values,.90);
 var bg=d.background.statistics?d.background.statistics.median:0;
 low=Math.max(low,bg+Math.max(1e-7,3*(d.noise.sigmaEstimate||0)));
 for(var sy=1;sy<H-1;sy+=signalStep)for(var sx=1;sx<W-1;sx+=signalStep){var sv=yAt(sx,sy);if(sv<=low||sv>=high)continue;
  var support=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++)if(yAt(sx+dx,sy+dy)>low) support++;
  if(support>=6)signalPoints.push({x:sx,y:sy});
 }
 if(signalPoints.length<12||high<=bg+5*Math.max(1e-7,d.noise.sigmaEstimate||0)||high-bg<.08*Math.max(1e-8,d.luminance.p999-bg)){
  var objectLow=Math.max(d.luminance.p99,bg+8*Math.max(1e-7,d.noise.sigmaEstimate||0)),objectPoints=[];
  for(var oy=1;oy<H-1;oy+=signalStep)for(var ox=1;ox<W-1;ox+=signalStep){var ov=yAt(ox,oy);if(ov<=objectLow||ov>=d.luminance.p999)continue;
   var support=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++)if(yAt(ox+dx,oy+dy)>objectLow) support++;
   if(support>=6)objectPoints.push({x:ox,y:oy});}
  if(objectPoints.length>=12){signalPoints=objectPoints;d.compactSignal=true;}
 }
 // Detect a concentrated, pedestal-dominated object even when cropping
 // raises its occupancy above the old top-one-percent fallback. A coherent
 // 5x5 neighborhood rejects isolated stars; HDR eligibility remains separate.
 var tail=Math.max(0,d.luminance.p999-bg),objectThreshold=bg+.45*tail;
 if(!d.compactSignal&&tail>40*Math.max(1e-7,d.noise.sigmaEstimate||0)&&
    high-bg<.60*tail&&bg>3*tail){
  var coherent=[],tested=0;
  for(var cy=2;cy<H-2;cy+=signalStep)for(var cx=2;cx<W-2;cx+=signalStep){tested++;
   var cv=yAt(cx,cy);if(cv<=objectThreshold||cv>=d.luminance.p999)continue;
   var nearby=0;for(var yy=-2;yy<=2;yy++)for(var xx=-2;xx<=2;xx++)if(yAt(cx+xx,cy+yy)>objectThreshold)nearby++;
   if(nearby>=18)coherent.push({x:cx,y:cy});
  }
  var occupancy=coherent.length/Math.max(1,tested);
  if(coherent.length>=12&&occupancy>=.001&&occupancy<=.35){
   signalPoints=coherent;d.compactSignal=true;
   d.objectDetection={version:2,method:"coherent pedestal-dominated bright structure",occupancy:occupancy,threshold:objectThreshold};
  }
 }
 d.signalPoints=signalPoints;
 if(d.luminance.p999<3*Math.max(1e-8,d.luminance.median)){d.corePoints=[];d.coreMethod="No distinct high-dynamic-range core detected";return d;}
 var threshold=Math.max(SSTPercentile(values,.98),d.luminance.median+6*(d.noise.sigmaEstimate||0),d.luminance.median+.10*(d.luminance.p999-d.luminance.median));
 for(y=2;y<H-2;y+=step)for(x=2;x<W-2;x+=step){var v=yAt(x,y),sourcePeak=0;for(var cc=0;cc<C;cc++)sourcePeak=Math.max(sourcePeak,image.sample(x,y,cc));if(v<threshold||sourcePeak>=.997)continue;
  var neighbors=0;for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)if(yAt(x+dx,y+dy)>=threshold)neighbors++;
  if(neighbors>=13)points.push({x:x,y:y,signal:v});
 }
 // Select from extended bright regions, not isolated brightest-pixel samples.
 d.corePoints=points;d.coreThreshold=threshold;d.coreMethod="source top 2 percent; >=13/25 bright neighbors; source-saturated pixels excluded";
 return d;
}

function SSTChannelHighlightSource(image,reference){
 var result=[],C=image.numberOfChannels,W=image.width,H=image.height,step=Math.max(1,Math.ceil(Math.sqrt(W*H/24000)));
 for(var c=0;c<C;c++){var values=[];
  for(var y=2;y<H-2;y+=step)for(var x=2;x<W-2;x+=step)values.push(image.sample(x,y,c));
  values.sort(function(a,b){return a-b;});var bg=SSTPercentile(values,.20),tail=SSTPercentile(values,.999),threshold=Math.max(SSTPercentile(values,.90),bg+.45*(tail-bg)),points=[];
  for(y=2;y<H-2;y+=step)for(x=2;x<W-2;x+=step){var v=image.sample(x,y,c);if(v<threshold||v>=.997)continue;
   var support=0;for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)if(image.sample(x+dx,y+dy,c)>=threshold)support++;
   if(support>=18)points.push({x:x,y:y,value:v});
  }
  var bright=points.map(function(p){return p.value;});bright.sort(function(a,b){return a-b;});
  result.push({points:points,sourceSpread:SSTPercentile(bright,.90)-SSTPercentile(bright,.10),threshold:threshold,background:bg});
 }return result;
}

function SSTChannelHighlightQuality(image,source){
 var refs=SSTOptional(source,"channelHighlights",[]),result=[],penalty=0,warning="";
 for(var c=0;c<refs.length;c++){var ref=refs[c],values=[],near=0,clipped=0;
  for(var i=0;i<ref.points.length;i++){var p=ref.points[i],v=image.sample(p.x,p.y,c);values.push(v);if(v>=.95)near++;if(v>=1-1e-6)clipped++;}
  values.sort(function(a,b){return a-b;});var n=values.length,median=SSTPercentile(values,.5),spread=SSTPercentile(values,.90)-SSTPercentile(values,.10),cost=0;
  var structured=n>=12&&ref.sourceSpread>Math.max(1e-7,3*(source.noise.sigmaEstimate||0));
  if(structured){cost=80*clipped/n+25*SSTClamp((median-.80)/.18,0,1)*SSTClamp((.12-spread)/.12,0,1);
   if(clipped/n>.02||median>.90&&spread<.045)warning=(refs.length==1?"Mono":["Red","Green","Blue"][c])+" highlight detail washed out";
  }
  penalty=Math.max(penalty,cost);result.push({channel:refs.length==1?"Mono":["R","G","B"][c],sampleCount:n,median:median,p90MinusP10:spread,nearMaximumFraction:n?near/n:0,clippedFraction:n?clipped/n:0,sourceSpread:ref.sourceSpread,structured:structured,penalty:cost});
 }return {channels:result,penalty:penalty,warning:warning};
}

function SSTRegionalQuality(image,source){
 if(!source.structure||["galaxy","extended"].indexOf(source.structure.type)<0)return null;
 function measure(points){var values=[],clip=0,details=[];for(var i=0;i<points.length;i++){var p=points[i],v=[],peak=0;for(var c=0;c<image.numberOfChannels;c++){var z=image.sample(p.x,p.y,c);v.push(z);peak=Math.max(peak,z);}var lum=SSTY(v);values.push(lum);if(peak>=1-1e-6)clip++;if(p.x+1<image.width){var next=[];for(c=0;c<image.numberOfChannels;c++)next.push(image.sample(p.x+1,p.y,c));details.push(Math.abs(lum-SSTY(next)));}}
 values.sort(function(a,b){return a-b;});details.sort(function(a,b){return a-b;});return {count:values.length,median:SSTPercentile(values,.5),spread:SSTPercentile(values,.9)-SSTPercentile(values,.1),clippedFraction:clip/Math.max(1,values.length),localContrast:SSTPercentile(details,.5)};}
 var core=measure(source.corePoints||[]),disk=measure(source.structure.diskPoints||[]),outer=measure(source.structure.outerPoints||[]),score=0;
 if(disk.count>=12)score+=18*SSTClamp(disk.spread/.22,0,1)+12*SSTClamp(disk.median/.35,0,1)-35*SSTClamp((disk.median-.85)/.12,0,1);
 if(outer.count>=12)score+=15*SSTClamp(outer.spread/.12,0,1)+10*SSTClamp(outer.localContrast/.008,0,1);
 if(core.count>=12)score+=10*SSTClamp(core.spread/.18,0,1)-60*core.clippedFraction;
 return {version:1,type:source.structure.type,core:core,diskOrNebula:disk,outskirts:outer,scoreAdjustment:score};
}

function SSTBackgroundPoints(image){
 var step=Math.max(1,Math.ceil(Math.sqrt(image.width*image.height/6000))),points=[],levels=[];
 for(var y=1;y<image.height-1;y+=step)for(var x=1;x<image.width-1;x+=step){var v=[];for(var c=0;c<image.numberOfChannels;c++)v.push(image.sample(x,y,c));points.push({x:x,y:y,level:SSTY(v)});levels.push(SSTY(v));}
 levels.sort(function(a,b){return a-b;});var limit=SSTPercentile(levels,.40);
 return points.filter(function(p){return p.level<=limit;});
}

function SSTBackgroundQuality(image,source){
 var points=SSTOptional(source,"backgroundPoints",[]),levels=[],differences=[],tiles={},colors=0;
 for(var i=0;i<points.length;i++){var p=points[i],v=[],next=[];for(var c=0;c<image.numberOfChannels;c++){v.push(image.sample(p.x,p.y,c));next.push(image.sample(p.x+1,p.y,c));}
  var lum=SSTY(v);levels.push(lum);differences.push(Math.abs(lum-SSTY(next)));
  var key=Math.floor(p.x*8/image.width)+":"+Math.floor(p.y*6/image.height);if(!Object.prototype.hasOwnProperty.call(tiles,key))tiles[key]=[];tiles[key].push(lum);
  if(v.length==3&&lum>.02){var peak=Math.max.apply(null,v),low=Math.min.apply(null,v);if((peak-low)/Math.max(1e-8,peak)>.80)colors++;}
 }
 levels.sort(function(a,b){return a-b;});differences.sort(function(a,b){return a-b;});var med=SSTPercentile(levels,.5),p90=SSTPercentile(levels,.90),tileMedians=[];
 for(var key in tiles)if(tiles[key].length>=4){tiles[key].sort(function(a,b){return a-b;});tileMedians.push(SSTPercentile(tiles[key],.5));}
 tileMedians.sort(function(a,b){return a-b;});var mottling=SSTPercentile(tileMedians,.9)-SSTPercentile(tileMedians,.1),noise=SSTPercentile(differences,.5)/(.67449*Math.sqrt(2));
 var broadband=SSTOptional(source,"palette","Broadband RGB")=="Broadband RGB",colorFraction=colors/Math.max(1,levels.length);
 var penalty=90*SSTClamp((med-.06)/.18,0,1)+70*SSTClamp((p90-.16)/.30,0,1)+50*SSTClamp((mottling-.025)/.12,0,1);
 if(broadband)penalty+=45*SSTClamp((colorFraction-.08)/.35,0,1);
 return {sampleCount:levels.length,median:med,p90:p90,mottling:mottling,noise:noise,colorfulBackgroundFraction:colorFraction,penalty:penalty};
}

function SSTQuality(image,source){
 var d=SSTDescribe(image,"candidate quality preview",12000),l=d.luminance,b=d.background.statistics;
 var clip=Math.max(0,d.clipping.anyChannelClippedFraction-source.clipping.anyChannelClippedFraction);
 var crushed=Math.max(0,d.clipping.allChannelsAtOrBelowZeroFraction-source.clipping.allChannelsAtOrBelowZeroFraction);
 var separation=Math.max(0,l.p90-l.p20),noise=d.noise.sigmaEstimate||0;
 var score=100-2200*clip-650*crushed-80*Math.max(0,(b?b.median:0)-.20)-50*Math.max(0,.015-l.p20);
 score+=12*Math.min(1,separation/.35)-20*Math.min(1,noise/Math.max(.02,separation));
 var stellar=source.structure&&source.structure.type=="starField";
 var points=stellar?[]:source.corePoints||[],coreValues=[],coreDetail=[],near=0,clipped=0;
 for(var i=0;i<points.length;i++){var p=points[i],v=[],maxv=0;
  for(var c=0;c<image.numberOfChannels;c++){var z=image.sample(p.x,p.y,c);v.push(z);maxv=Math.max(maxv,z);}
  coreValues.push(SSTY(v));
  if(p.x>0&&p.x<image.width-1&&p.y>0&&p.y<image.height-1){var neighbors=0;
   for(var axis=0;axis<4;axis++){var nv=[],nx=p.x+(axis==0?-1:axis==1?1:0),ny=p.y+(axis==2?-1:axis==3?1:0);
    for(var nc=0;nc<image.numberOfChannels;nc++)nv.push(image.sample(nx,ny,nc));neighbors+=SSTY(nv);}
   coreDetail.push(Math.abs(SSTY(v)-neighbors*.25));
  }
  if(maxv>=.97)near++;if(maxv>=1-1e-6)clipped++;
 }
 coreValues.sort(function(a,b){return a-b;});var core=null,warning="";
 if(points.length>=12){var range=SSTPercentile(coreValues,.90)-SSTPercentile(coreValues,.10),median=SSTPercentile(coreValues,.5),white=near/points.length;
  var compression=median>.75?SSTClamp((.045-range)/.045,0,1):0;
  core={count:points.length,median:median,p90MinusP10:range,nearWhiteFraction:white,clippedFraction:clipped/points.length,compressionPenalty:compression};
  // Brightness alone is not damage: penalize near-white values only when
  // the core also loses spread. Actual clipping remains strongly penalized.
  score-=35*white*compression+100*core.clippedFraction+30*compression;
  // For extended HDR cores, reward usable tonal spread rather than darkness.
  if(SSTHDRAssessment(source).eligible){
   coreDetail.sort(function(a,b){return a-b;});var detail=SSTPercentile(coreDetail,.75);
   core.localContrast=detail;score+=12*SSTClamp(detail/.02,0,1);
   score+=18*SSTClamp(range/.16,0,1);score-=45*SSTClamp((median-.82)/.16,0,1)*SSTClamp((.12-range)/.12,0,1);
   if(median>.88&&range<.06)warning="Bright core washed out";
  }
  if(core.clippedFraction>.02)warning="Bright-core clipping";
  else if(white>.20&&range<.06||median>.88&&range<.025)warning="Bright core washed out";
 }
 var signalValues=[],sp=stellar?source.structure.stellarPoints:source.signalPoints||[];
 for(var si=0;si<sp.length;si++){var sv=[];for(var sc=0;sc<image.numberOfChannels;sc++)sv.push(image.sample(sp[si].x,sp[si].y,sc));signalValues.push(SSTY(sv));}
 signalValues.sort(function(a,b){return a-b;});
 var galaxy=source.structure&&source.structure.type=="galaxy";
 var objectQuality=stellar||galaxy?null:SSTObjectQuality(signalValues,SSTOptional(source,"compactSignal",false));
 if(objectQuality){score-=objectQuality.penalty;if(objectQuality.washedOut&&!warning)warning="Object detail washed out";
  if(SSTOptional(source,"compactSignal",false))score+=12*SSTClamp(objectQuality.p90MinusP10/.25,0,1)-12*Math.min(1,separation/.35);
 }
 var channelQuality=SSTChannelHighlightQuality(image,source);score-=channelQuality.penalty;
 if(galaxy&&channelQuality.warning){var strong=false;for(var ch=0;ch<channelQuality.channels.length;ch++){var cq=channelQuality.channels[ch];if(cq.clippedFraction*cq.sampleCount>=3||cq.median>.9&&cq.p90MinusP10<.045)strong=true;}if(!strong)channelQuality.warning="";}
 if(!warning&&channelQuality.warning)warning=channelQuality.warning;
 var measuredSignal=signalValues.length>=12?SSTPercentile(signalValues,.5):l.p75===undefined?l.p90:l.p75;
 var background=b?b.median:l.p20,signalContrast=Math.max(0,measuredSignal-background);
 var visibility=SSTClamp(Math.min(measuredSignal/.18,signalContrast/.07),0,1);
 score+=22*visibility;score-=25*(1-visibility);
 var sky=SSTBackgroundQuality(image,source),skyPenalty=sky.sampleCount>=24?sky.penalty:0;
 var noiseProminence=sky.sampleCount>=24?sky.noise/Math.max(.01,signalContrast):noise/Math.max(.01,signalContrast);
 var noisePenalty=65*SSTClamp((noiseProminence-.015)/.15,0,1);score-=skyPenalty+noisePenalty;
 var stellarQuality=null;
 if(stellar){var whiteStars=0,spread=[];for(var st=0;st<sp.length;st++){var point=sp[st],peak=0,wings=0,count=0;for(var cc=0;cc<image.numberOfChannels;cc++)peak=Math.max(peak,image.sample(point.x,point.y,cc));if(peak>.96)whiteStars++;
  for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){if(!dx&&!dy)continue;var sx=point.x+dx,sy=point.y+dy;if(sx<0||sy<0||sx>=image.width||sy>=image.height)continue;var vv=[];for(cc=0;cc<image.numberOfChannels;cc++)vv.push(image.sample(sx,sy,cc));wings+=Math.max(0,SSTY(vv)-background);count++;}spread.push(wings/Math.max(1,count)/Math.max(.001,peak-background));}
  spread.sort(function(a,b){return a-b;});var whiteFraction=whiteStars/Math.max(1,sp.length),wingRatio=SSTPercentile(spread,.5);
  var starPenalty=100*whiteFraction+70*SSTClamp((wingRatio-.35)/.4,0,1)+100*SSTClamp(background/.06,0,1)+40*SSTClamp(noise/.012,0,1);score-=starPenalty;
  stellarQuality={nearWhiteFraction:whiteFraction,medianWingToPeak:wingRatio,penalty:starPenalty};if(whiteFraction>.15)warning="Too many near-white stellar cores";else if(background>.06||noise>.012)warning="Stellar background amplified";
 }
 var regional=SSTRegionalQuality(image,source);if(regional)score+=regional.scoreAdjustment;
 var palette=SSTOptional(source,"palette","Broadband RGB"),paletteQuality=null;
 if(palette=="SHO"&&image.numberOfChannels==3){var rp=source.structure?source.structure.diskPoints:[],reds=[],redClipped=0;for(var pi=0;pi<rp.length;pi++){var rv=image.sample(rp[pi].x,rp[pi].y,0);reds.push(rv);if(rv>=1-1e-6)redClipped++;}reds.sort(function(a,b){return a-b;});var redSpread=SSTPercentile(reds,.9)-SSTPercentile(reds,.1),fraction=redClipped/Math.max(1,reds.length),adjustment=reds.length>=12?4*SSTClamp(redSpread/.18,0,1)-40*fraction:0;score+=adjustment;paletteQuality={sampleCount:reds.length,redSpread:redSpread,redClippedFraction:fraction,scoreAdjustment:adjustment};}
 // Strong background amplification must not masquerade as recovered object detail.
 if(!warning&&sky.sampleCount>=24&&sky.median>.22)warning="Background amplified";
 if(!warning&&sky.sampleCount>=24&&sky.noise>.025&&noiseProminence>.15)warning="Background noise amplified";
 if(!warning&&palette=="Broadband RGB"&&sky.sampleCount>=24&&sky.colorfulBackgroundFraction>.40)warning="Background color oversaturation";
 // Mild stretches are valid alternatives when they retain structure.
 if(!warning&&visibility<.40)warning="Faint overall signal";
 if(!warning&&clip>.003)warning="Highlight clipping";
 // A dark background alone is not a hard warning: retain it as a score penalty.
 if(!warning&&crushed>.12)warning="Extensive shadow clipping";
 return {version:13,backgroundQuality:sky,noiseProminence:noiseProminence,noisePenalty:noisePenalty,palette:palette,paletteQuality:paletteQuality,regional:regional,stellarQuality:stellarQuality,structure:source.structure?source.structure.type:"extended",channelHighlights:channelQuality,objectQuality:objectQuality,visibility:{eligible:visibility>=.40,adequacy:visibility,signalMedian:measuredSignal,signalAboveBackground:signalContrast,sampleCount:signalValues.length},score:score,warning:warning,addedClipping:clip,addedBlack:crushed,signalSeparation:separation,noiseEstimate:noise,backgroundMedian:b?b.median:null,brightCore:core};
}

function SSTDetectedStructure(reference){
 var shape=reference.structure?reference.structure.type:"extended";
 if(shape=="cluster")return "Detected structure: Globular-cluster-like concentration of stars — existing stretch protection retained";
 if(shape=="starField")return "Detected structure: Dispersed star field — nebular HDR protection disabled";
 if(shape=="galaxy")return "Detected structure: Elongated galaxy-like object — conventional and core-protected stretches compared";
 if(shape=="extended"&&reference.structure&&reference.structure.peakCount>=100&&!SSTHDRAssessment(reference).eligible)return "Detected structure: Extended nebulosity with bright knots — no concentrated HDR core detected";
 if(SSTHDRAssessment(reference).eligible)return "Detected structure: Concentrated bright core with faint surroundings — HDR protection enabled";
 if(SSTOptional(reference,"compactSignal",false))return "Detected structure: Concentrated bright nebular structure with faint surroundings — compact-object protection enabled";
 if((reference.signalPoints||[]).length<12)return "Detected structure: No clear extended object detected — general stretch comparison";
 var bg=reference.background.statistics?reference.background.statistics.median:0;
 if(reference.luminance.p90-bg<8*Math.max(1e-7,reference.noise.sigmaEstimate||0))return "Detected structure: Predominantly faint extended signal — no concentrated HDR core detected";
 return "Detected structure: Extended signal across the field — no concentrated HDR core detected";
}

function SSTOptional(object,key,fallback){return object&&Object.prototype.hasOwnProperty.call(object,key)?object[key]:fallback;}

function SSTPersonalizeCandidates(candidates,stats,model,groupIndex){
 if(!model||!model.examples.length)return candidates;
 // Only one candidate per grid is biased; other families remain exploratory.
 var templates=model.examples.slice().sort(function(a,b){return b.weight-a.weight;});
 for(var group=0;group<Math.ceil(candidates.length/9);group++){var e=templates[(groupIndex===undefined?group:groupIndex)%templates.length],prior=e.recipe;
  if(SSTOptional(prior,"quick",false)||[3,4].indexOf(prior.family)<0||SSTOptional(prior,"selectiveMidtone",null)!==null||SSTOptional(prior,"hdrShape",null)!==null)continue;
  for(var i=group*9;i<Math.min(candidates.length,group*9+9);i++){var p=candidates[i];if(p.family!=prior.family||p.quick||SSTOptional(p,"hdr",null))continue;
   var mix=Math.min(.35,model.confidence),old=e.stats.luminance.median,now=stats.luminance.median;
   if(old<=0||now<=0)break;
   var shape=prior.method=="mtf"?prior.shape[0]*now/old:prior.shape[0]*old/now;
   p.shape[0]=Math.exp((1-mix)*Math.log(p.shape[0])+mix*Math.log(SSTClamp(shape,1e-8,prior.method=="mtf"?1-1e-8:1e8)));
   p.black[0]=SSTClamp((1-mix)*p.black[0]+mix*prior.black[0]*now/old,0,now*.8);
   p.finishGamma=Math.exp((1-mix)*Math.log(p.finishGamma||1)+mix*Math.log(prior.finishGamma||1));
   p.preferenceGuided=true;p.preferenceSource=e.sourceId;break;
  }
 }return candidates;
}

function SSTLegacyGrid(session){if(session.stage=="final"||session.stage=="complete")return session.winners.slice();return session.candidates.slice(session.round*9,session.round*9+9);}

function SSTCopy(p){return JSON.parse(JSON.stringify(p));}

function SSTShuffle(a,seed){var state=seed>>>0;for(var i=a.length-1;i>0;i--){state=(1664525*state+1013904223)>>>0;var j=state%(i+1),p=a[i];a[i]=a[j];a[j]=p;}return a;}

function SSTRefineGrid(session,parent){
 var state=(session.seed+7919*(session.branch+1)+104729*(session.refineStep+1))>>>0;
 function random(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
 if(session.refineAlgorithm>=4)return SSTFinishedRefine(session,parent);
 if(session.refineAlgorithm==3)return SSTScenarioRefine(session,parent);
 var enhanced=session.refineAlgorithm==2,key=session.branch+":"+session.refineStep;
 var widen=enhanced&&session.refineWidths?session.refineWidths[key]||0:0;
 var amount=(enhanced?[.30,.18,.10]:[.12,.07,.035])[session.refineStep]*Math.pow(1.7,widen),grid=[SSTCopy(parent)];
 for(var i=1;i<9;i++){var p=SSTCopy(parent);p.id="r"+session.branch+"s"+session.refineStep+"v"+i;p.rootId=parent.rootId||parent.id;p.parentId=parent.id;p.baseline=false;
  var shared=(random()*2-1)*amount;
  if(enhanced){var direction=i%2?1:-1,magnitude=(Math.floor((i-1)/2)+1)/4;shared=direction*magnitude*amount;}
  for(var c=0;c<p.shape.length;c++){
   var delta=shared+(random()*2-1)*amount*.2,u=p.shape[c];
   if(p.method=="mtf"){var odds=(1-u)/Math.max(1e-12,u)*Math.exp(delta);p.shape[c]=SSTClamp(1/(1+odds),1e-8,1-1e-8);}
   else p.shape[c]=SSTClamp(u*Math.exp(delta),1e-8,1e12);
   var stats=p.family<3?session.stats.channels[c]:session.stats.luminance;
   // Never move a zero black point upward: preserve the chosen no-clipping intent.
   if(p.black[c]>0)p.black[c]=SSTClamp(p.black[c]+(random()*2-1)*stats.sigma*amount,0,Math.max(0,stats.median-1e-12));
  }
  if(p.second>0){var odds=(1-p.second)/p.second*Math.exp((random()*2-1)*amount);p.second=SSTClamp(1/(1+odds),1e-8,1-1e-8);}
  if(p.quick)p.contrast=SSTClamp(p.contrast+(random()*2-1)*amount,0,1.5);
  if(enhanced)p.finishGamma=SSTClamp((parent.finishGamma||1)*Math.exp(-shared*.55),.35,2.8);
  grid.push(p);
 }return SSTShuffle(grid,state);
}

function SSTFinishedRefine(s,parent){
 var width=s.refineAlgorithm>=5?(s.refineWidths[s.branch+":"+s.refineStep]||0):0;
 var amount=[.24,.14,.08][s.refineStep]*Math.pow(1.7,width),g=[SSTCopy(parent)];
 var names=["Lift faint signal","Restrain faint signal","Lift midtones","Restrain midtones","Lift overall brightness","Restrain overall brightness","Lift highlights","Restrain highlights"];
 for(var i=1;i<9;i++){var p=SSTCopy(parent);p.id="r"+s.branch+"s"+s.refineStep+"v"+i;p.rootId=parent.rootId||parent.id;p.parentId=parent.id;p.baseline=false;p.scenario=names[i-1];
  p.finishRefinements=SSTOptional(p,"finishRefinements",[]).slice();
  p.finishRefinements.push({mode:Math.floor((i-1)/2),strength:(i%2?1:-1)*amount});g.push(p);
 }return g;
}

function SSTRefineFinished(v,p){
 var steps=SSTOptional(p,"finishRefinements",[]);
 for(var i=0;i<steps.length;i++){var peak=Math.max.apply(null,v);if(peak<=0)continue;
  var h=steps[i],weight=h.mode==0?(1-peak)*(1-peak):h.mode==1?4*peak*(1-peak):h.mode==3?peak*peak:1;
  var mapped=peak+h.strength*peak*(1-peak)*weight,gain=mapped/peak;
  for(var c=0;c<v.length;c++)v[c]=SSTClamp(v[c]*gain,0,1);
 }return v;
}

function SSTScenarioRefine(s,parent){
 var key=s.branch+":"+s.refineStep,w=s.refineWidths[key]||0,amount=[.32,.20,.12][s.refineStep]*Math.pow(1.7,w),g=[SSTCopy(parent)];
 var names=["Brighter faint signal","Darker background","Stronger midtones","Gentler midtones","Preserve shadows","Tighter black point","Highlight restraint","Highlight lift"];
 for(var i=1;i<9;i++){var p=SSTCopy(parent);p.id="r"+s.branch+"s"+s.refineStep+"v"+i;p.rootId=parent.rootId||parent.id;p.parentId=parent.id;p.baseline=false;p.scenario=names[i-1];
  var sign=i%2?1:-1;
  var h=SSTOptional(p,"hdr",null);
  var lift=SSTOptional(p,"objectLift",null);
  if(lift&&i<=2){var u=lift.midtone;lift.midtone=SSTClamp(1/(1+(1-u)/u*Math.exp(sign*amount)),1e-8,1-1e-8);}
  else if(h){
   if(i<=2)h.backgroundOutput=SSTClamp(h.backgroundOutput*Math.exp(sign*amount),.005,.16);
   else if(i<=4)h.kneeOutput=SSTClamp(h.kneeOutput+sign*amount*.18,.25,.70);
   else if(i<=6){if(h.version==2){h.coreContrast=SSTClamp(h.coreContrast+sign*amount*.5,0,.9);h.saturation=SSTClamp(h.saturation+sign*amount*.15,0,.35);}
    else h.lowShape=SSTClamp(h.lowShape*Math.exp(sign*amount),.1,40);}
   else h.ceiling=SSTClamp(h.ceiling+sign*amount*.10,Math.max(.75,h.kneeOutput+.05),.98);
  }
  else if(p.selectiveMidtone!==undefined&&i>=3&&i<=4){var u=p.selectiveMidtone;p.selectiveMidtone=SSTClamp(1/(1+(1-u)/u*Math.exp(sign*amount)),1e-8,1-1e-8);p.selectiveKnee=SSTClamp(SSTMTF(.60,1-p.selectiveMidtone),1e-7,.9);}
  else if(p.selectiveMidtone!==undefined&&i>=5&&i<=6)p.selectiveCeiling=SSTClamp(p.selectiveCeiling+sign*amount*.08,.72,.98);
  else if(p.hdrShape!==undefined&&i>=3&&i<=4)p.hdrShape=SSTClamp(p.hdrShape*Math.exp(sign*amount),0,1e12);
  else if(p.hdrShape!==undefined&&i>=5&&i<=6)p.finishGamma=SSTClamp((p.finishGamma||1)*Math.exp(sign*amount*.35),.35,2.8);
  else if(i<=2||i>=7)p.finishGamma=SSTClamp((p.finishGamma||1)*Math.exp(-sign*amount*(i>=7?-.6:1)),.35,2.8);
  else if(i<=4){for(var c=0;c<p.shape.length;c++){var u=p.shape[c];p.shape[c]=p.method=="mtf"?SSTClamp(1/(1+(1-u)/Math.max(1e-12,u)*Math.exp(sign*amount)),1e-8,1-1e-8):SSTClamp(u*Math.exp(sign*amount),1e-8,1e12);}}
  else{for(var c=0;c<p.black.length;c++){var t=p.family<3?s.stats.channels[c]:s.stats.luminance;p.black[c]=SSTClamp(p.black[c]-sign*t.sigma*amount,0,Math.max(0,t.median-1e-12));}}
  SSTProtectCompactRecipe(p,s.stats);g.push(p);
 }return g;
}

function SSTGridKey(s){return s.stage+":"+s.round+":"+(s.branch||0)+":"+(s.refineStep||0);}

function SSTGrid(s){if(s.flow!==2)return SSTLegacyGrid(s);
 var key=SSTGridKey(s);if(s.replacementGrids&&s.replacementGrids[key])return s.replacementGrids[key];
 if(s.stage=="round")return s.candidates.slice(s.round*9,s.round*9+9);
 if(s.stage=="shortlist")return s.winners.slice();
 if(s.stage=="refine")return s.refineGrid;
 if(s.stage=="playoff")return s.refinedWinners.slice();
 if(s.stage=="compare")return [s.userFavorite,s.autoPath.finalWinner];
 return [s.finalWinner];
}

function SSTPreviewSamples(image){var a=[];for(var y=0;y<20;y++)for(var x=0;x<30;x++)for(var c=0;c<image.numberOfChannels;c++)a.push(image.sample(Math.min(image.width-1,Math.floor((x+.5)*image.width/30)),Math.min(image.height-1,Math.floor((y+.5)*image.height/20)),c));return a;}

// ----------------------------------------------------------------------------
// Histogram control
// ----------------------------------------------------------------------------

function HistogramControl( parent )
{
   this.__base__ = Control;
   this.__base__( parent );

   var self = this;

   this.bins = [];
   this.selectionDensity=null;
   this.setSelectionDensity=function(d){this.selectionDensity=d;this.update();};
   this.maximum = 1;
   this.ranges = [ { center:0.5, low:0.0, high:1.0 } ];
   this.onSignalClicked = null;
   this.stretchFocus="center";this.focusSP=.5;this.onFocusWeight=null;
   this.focusBounds=function(range){
      var symmetry=this.selectionMode=="symmetry"||range.type=="symmetry";
      var lo=symmetry?0:range.low,hi=symmetry?1:range.high;
      var pivot=symmetry?this.focusSP:range.center;
      if(this.selectionMode!="signal"&&!symmetry)return {low:lo,high:hi};
      if(this.stretchFocus=="left")hi=Math.min(hi,pivot);
      else if(this.stretchFocus=="right")lo=Math.max(lo,pivot);
      return {low:lo,high:hi};
   };
   this.zoomMin = 0.0;
   this.zoomMax = 1.0;
   this.spatialLocked = false;
   this.channelMode = "RGBK";
   this.selectionMode = "symmetry";

   this.setChannelMode=function(m){this.channelMode=m;this.update();};
   this.setSelectionMode=function(m)
   {
      this.selectionMode=m;
      this.toolTip=m=="symmetry" ? "Click to set the Symmetry Point (SP)." :
         (m=="color" ? "Color mode — histogram selection is locked." :
          "Click to select a signal value. Ctrl-click adds/removes signal ranges.");
      this.update();
   };

   this.setMinSize(Math.min(640,STScreenFit.previewSize(this,1280,760).width),Math.min(170,Math.max(80,Math.floor(STScreenFit.bounds(this).height*.19))));

   this.setHistogram = function( bins, resetZoom )
   {
      this.bins = bins;
      this.maximum = 1;
      for ( var i = 0; i < bins.length; ++i )
         if ( bins[i] > this.maximum )
            this.maximum = bins[i];

      // Live histogram updates must not destroy a user-selected zoom.
      if ( resetZoom === true )
      {
         this.zoomMin = 0.0;
         this.zoomMax = 1.0;
      }
      else
      {
         this.zoomMin = Math.max( 0.0, Math.min( 1.0, this.zoomMin ) );
         this.zoomMax = Math.max( 0.0, Math.min( 1.0, this.zoomMax ) );
         if ( this.zoomMax <= this.zoomMin )
         {
            this.zoomMin = 0.0;
            this.zoomMax = 1.0;
         }
      }
      this.update();
   };

   this.setRanges = function( ranges )
   {
      this.ranges = [];
      for ( var i = 0; i < ranges.length; ++i )
         this.ranges.push( { center:ranges[i].center,
                             low:ranges[i].low,
                             high:ranges[i].high,
                             type:ranges[i].type || "signal" } );
      this.update();
   };

   this.setSelectionLocked = function( locked, reason )
   {
      this.spatialLocked=locked;
      this.lockReason=reason || "";
      this.toolTip=locked ? this.lockReason :
         "Click to select a signal value. Ctrl-click adds/removes signal ranges.";
      this.update();
   };

   this.resetZoom = function()
   {
      this.zoomMin = 0.0;
      this.zoomMax = 1.0;
      this.update();
   };

   // Pan the existing histogram window; keep signal coordinates and zoom intact.
   this.centerOnSignal = function(value)
   {
      value=Math.max(0,Math.min(1,value));
      var span=Math.max(1.0e-12,Math.min(1,this.zoomMax-this.zoomMin));
      this.zoomMin=Math.max(0,Math.min(1-span,value-span/2));
      this.zoomMax=this.zoomMin+span;
      this.update();
   };

   this.zoomToPeak = function()
   {
      this.lastPeak=null;
      if ( this.bins.length < 2 )
         return null;

      var n=this.bins.length;
      var total=0;
      for(var i=0;i<n;++i)
         total+=this.bins[i];
      if(total<=0)
         return null;

      // A lightly smoothed copy is used ONLY to identify the main peak.
      // Unlike percentile limits, peak-width framing does not include a
      // long, faint highlight tail in the zoom window.
      var smooth=new Array(n);
      var peakBin=0,peakValue=0;
      for(var j=0;j<n;++j)
      {
         var left=this.bins[Math.max(0,j-1)];
         var mid=this.bins[j];
         var right=this.bins[Math.min(n-1,j+1)];
         smooth[j]=0.25*left+0.5*mid+0.25*right;
         if(smooth[j]>peakValue)
         {
            peakValue=smooth[j];
            peakBin=j;
         }
      }
      if(peakValue<=0)
         return null;

      // Find where the dominant population falls to 10% of its peak,
      // then provide extra room on either side for the full peak profile.
      var threshold=0.10*peakValue;
      var loBin=peakBin,hiBin=peakBin;
      while(loBin>0 && smooth[loBin-1]>=threshold)
         --loBin;
      while(hiBin<n-1 && smooth[hiBin+1]>=threshold)
         ++hiBin;

      // Frame the 10%-height peak base to approximately 20% of the
      // histogram plot HEIGHT in screen pixels. This makes zoom consistent
      // across different histogram/window sizes instead of letting the peak
      // expand across most of the display width.
      var plotHeight=Math.max(1,this.height-27);
      var targetBasePixels=Math.max(1,0.20*plotHeight);
      var plotWidth=Math.max(1,this.width);
      var peakWidthBins=Math.max(1,hiBin-loBin+1);
      var visibleBins=Math.max(16,Math.min(n,
         peakWidthBins*plotWidth/targetBasePixels));

      // Center on the main peak while retaining the full desired span.
      // At the black/white endpoints shift the entire window inward rather
      // than cutting its width and accidentally zooming back in.
      var centerBin=0.5*(loBin+hiBin+1);
      var startBin=centerBin-0.5*visibleBins;
      startBin=Math.max(0,Math.min(n-visibleBins,startBin));

      this.zoomMin=startBin/n;
      this.zoomMax=(startBin+visibleBins)/n;
      this.lastPeak={bin:peakBin,value:(peakBin+0.5)/n,bins:n};
      this.update();
      return this.lastPeak;
   };

   this.onPaint = function()
   {
      var g = new Graphics( this );
      try
      {
         var w = this.width;
         var h = this.height;
         var bottom = h - 22;
         var z0 = this.zoomMin;
         var z1 = this.zoomMax;
         var zs = Math.max( 1.0e-12, z1-z0 );

         g.fillRect( 0, 0, w, h, new Brush( 0xff181818 ) );

         if ( this.bins.length > 0 )
         {
            var n = this.bins.length;

            // Keep the RAW histogram intact for calculations and SP clicks.
            // Only a very small, display-only filter is applied so a narrow
            // linear peak stays narrow instead of becoming a broad plateau.
            // Fractional-bin interpolation prevents stair-step blocks.
            var displayValues=new Array(w);
            var displayMaximum=0;

            for(var dx=0;dx<w;++dx)
            {
               var dv=z0+zs*(dx+0.5)/w;
               var bp=dv*n-0.5;
               var bi=Math.floor(bp);
               var bt=bp-bi;

               // 1:2:1 smoothing across neighboring raw bins, followed by
               // linear interpolation at the exact fractional position.
               var i0=Math.max(0,Math.min(n-1,bi));
               var i1=Math.max(0,Math.min(n-1,bi+1));
               var a0=0.25*this.bins[Math.max(0,i0-1)]+
                      0.5*this.bins[i0]+
                      0.25*this.bins[Math.min(n-1,i0+1)];
               var a1=0.25*this.bins[Math.max(0,i1-1)]+
                      0.5*this.bins[i1]+
                      0.25*this.bins[Math.min(n-1,i1+1)];
               var value=a0*(1-bt)+a1*bt;
               displayValues[dx]=value;
               if(value>displayMaximum)
                  displayMaximum=value;
            }

            // Linear vertical scaling faithfully shows peak sharpness.
            // Leave 10% headroom so the crest is never flush with the top.
            var verticalScale=displayMaximum>0 ?
               0.90*(bottom-5)/displayMaximum : 0;

            for ( var x = 0; x < w; ++x )
            {
               var v = z0 + zs*(x+0.5)/w;
               var y = bottom - Math.round(
                  displayValues[x]*verticalScale );
               if(y<5)y=5;

               var selected = false;
               for(var r=0;r<this.ranges.length;r++){
                  var bounds=this.focusBounds(this.ranges[r]);
                  if(v>=bounds.low&&v<=bounds.high){selected=true;break;}
               }
               if(selected&&this.onFocusWeight)selected=this.onFocusWeight(v)>1e-8;

               var nc=0xff606060, sc=0xffc8c8c8;
               if(this.channelMode=="R"){nc=0xff902828;sc=0xffff6060;}
               else if(this.channelMode=="G"){nc=0xff287828;sc=0xff60ff60;}
               else if(this.channelMode=="B"){nc=0xff303090;sc=0xff7070ff;}
               g.fillRect(x,y,x+1,bottom,new Brush(selected?sc:nc));
               if(this.selectionMode=="lowcontrast"&&this.selectionDensity){
                  var fraction=STLCDensityAt(this.selectionDensity,v);
                  if(fraction>0){
                     // Cyan occupies the selected fraction of the existing bar;
                     // raw counts and the histogram's zoom/vertical scale stay intact.
                     var selectedY=bottom-Math.round((bottom-y)*fraction);
                     if(selectedY<bottom)g.fillRect(x,selectedY,x+1,bottom,new Brush(0xff40d8ff));
                     var alpha=Math.round(220*fraction);
                     if(alpha>0)g.fillRect(x,bottom+2,x+1,bottom+5,new Brush((alpha<<24)|0x0040d8ff));
                  }
               }
            }
         }

         // Selection ranges remain in true 0..1 signal coordinates.
         for ( var q = 0; q < this.ranges.length; ++q )
         {
            var range = this.ranges[q];
            var affected=this.focusBounds(range);
            var dlo = Math.max( affected.low, z0 );
            var dhi = Math.min( affected.high, z1 );

            if ( dhi >= dlo )
            {
               var lx = Math.round( (dlo-z0)/zs*w );
               var hx = Math.round( (dhi-z0)/zs*w );
               if(hx>lx)for(var sx=lx;sx<hx;sx++){
                  var signal=z0+zs*(sx+.5)/w;
                  var weight=this.onFocusWeight?this.onFocusWeight(signal):1;
                  var alpha=Math.round(32*Math.max(0,Math.min(1,weight)));
                  if(alpha>0)g.fillRect(sx,0,sx+1,bottom,new Brush((alpha<<24)|0x0030a0ff));
               }

               g.pen = new Pen( 0xffffffff, 1 );
               g.drawLine( lx, 0, lx, bottom );
               g.drawLine( hx, 0, hx, bottom );
            }

            if ( range.center >= z0 && range.center <= z1 )
            {
               var cx = Math.round( (range.center-z0)/zs*(w-1) );
               g.pen = new Pen( 0xffffff00,
                  this.selectionMode=="symmetry" ? 3 : 2 );
               g.drawLine( cx, 0, cx, bottom );
               if(this.selectionMode=="symmetry")
                  g.drawText(Math.min(w-62,cx+5),16,
                     "SP "+range.center.toFixed(3));
            }
         }

         g.pen = new Pen( 0xff909090 );
         g.drawLine( 0, bottom, w-1, bottom );

         g.pen = new Pen( 0xffd0d0d0 );
         g.drawText( 3, h-5, z0.toFixed( 4 ) );
         var rightLabel = z1.toFixed( 4 );
         g.drawText( Math.max( 3, w-55 ), h-5, rightLabel );
         if ( this.spatialLocked )
         {
            g.pen = new Pen( 0xffc0c0c0 );
            g.drawText( 12, 20,
               this.selectionMode=="lowcontrast" ? "Cyan: Low Contrast mask (weighted pixels); selection locked" :
               "Spatial selection active — histogram selection locked" );
         }
      }
      finally
      {
         g.end();
      }
   };

   this.onMousePress = function( x, y, button, buttons, modifiers )
   {
      if ( this.spatialLocked )
         return;

if ( this.width < 2 )
         return;

      var fraction = Math.max( 0, Math.min( 1, x/(this.width-1) ) );
      var value = this.zoomMin + fraction*(this.zoomMax-this.zoomMin);

      // Keep the proven Stage 4.3.1 raw Control modifier bit.
      var ctrl = (modifiers & 0x02) != 0;

      if ( this.onSignalClicked != null )
         this.onSignalClicked( value, ctrl );
   };
}
HistogramControl.prototype = new Control;

// ----------------------------------------------------------------------------
// Histogram calculation
// ----------------------------------------------------------------------------

function calculateHistogram(image,numberOfBins,channelMode)
{
   return SmartTools.histogram(image,numberOfBins,channelMode);
}

// ----------------------------------------------------------------------------
// Stage 3 localized transformation
// ----------------------------------------------------------------------------

function smoothstep( a, b, x )
{
   if ( b <= a )
      return x >= b ? 1 : 0;
   var t = Math.max( 0, Math.min( 1, (x-a)/(b-a) ) );
   return t*t*(3 - 2*t);
}

function selectionWeight( v, lo, hi )
{
   if ( v < lo || v > hi || hi <= lo )
      return 0;

   // Feather 12% of the selected width at each edge.
   var f = Math.max( 0.000001, 0.12*(hi-lo) );
   var left = smoothstep( lo, Math.min( hi, lo+f ), v );
   var right = 1 - smoothstep( Math.max( lo, hi-f ), hi, v );
   return Math.min( left, right );
}

function nonlinearStretchValue( v, stretch )
{
   // True nonlinear asinh stretch. At stretch=0 this is exactly identity.
   // Increasing stretch progressively lifts faint/mid-level signal while
   // preserving a bounded 0..1 output.
   if ( stretch <= 0 )
      return v;

   var k = Math.pow( 10, 0.75*stretch ) - 1;
   if ( k < 1.0e-8 )
      return v;

   return Math.asinh( k*v )/Math.asinh( k );
}

// Apply only to the Stretch Factor contribution, never to other adjustments.
function focusedStretchValue(v, transformed, sp, focus)
{
   if(focus!="left" && focus!="right")return transformed;
   sp=Math.max(0.000001,Math.min(0.999999,sp));
   if((focus=="left" && v>=sp)||(focus=="right" && v<=sp))return v;
   var distance=focus=="left"?(sp-v)/sp:(v-sp)/(1-sp);
   var t=Math.max(0,Math.min(1,distance/0.05));
   return v+t*t*(3-2*t)*(transformed-v);
}

// GHS-inspired localization of the nonlinear stretch. Local Intensity chooses
// the signal level where Stretch Factor has maximum influence. The neutral
// value 0.5 preserves the established Smart Stretch curve.
function symmetryPointStretchValue( v, stretch, sp, localIntensity, focus )
{
   if(stretch<=0)return v;

   sp=Math.max(0.000001,Math.min(0.999999,sp));
   var li=Math.max(0,Math.min(1,localIntensity));
   var k=Math.pow(10,0.75*stretch)-1;
   if(k<1.0e-8)return v;

   // First calculate the established SP-pivoted nonlinear transform.
   // SP remains a fixed pivot.
   var base=v;
   if(v<sp)
   {
      var u=(sp-v)/sp;
      var q=Math.asinh(k*u)/Math.asinh(k);
      base=sp-sp*q;
   }
   else if(v>sp)
   {
      var w=(v-sp)/(1-sp);
      var z=Math.asinh(k*w)/Math.asinh(k);
      base=sp+(1-sp)*z;
   }

   // Local Intensity now participates in Symmetry Point mode.
   //
   // LI=0.5 is neutral and preserves the previous SP transform exactly.
   // Moving LI toward 0 concentrates more of the requested transformation
   // below SP; moving it toward 1 concentrates more above SP.  A nonzero
   // floor keeps the curve continuous and avoids abruptly freezing either
   // side of the pivot.  This is GHS-inspired interaction, not a claim of
   // exact GeneralizedHyperbolicStretch mathematics.
   if(Math.abs(li-0.5)<1.0e-8)
      return focusedStretchValue(v,base,sp,focus);

   var sidePosition;
   if(v<sp)
      sidePosition=-Math.min(1,(sp-v)/sp);
   else if(v>sp)
      sidePosition=Math.min(1,(v-sp)/(1-sp));
   else
      sidePosition=0;

   // LI maps to a preferred side/location around the fixed SP:
   // -1 = deepest lower side, 0 = SP, +1 = highest upper side.
   var preferred=2*li-1;
   var sigma=0.70;
   var d=(sidePosition-preferred)/sigma;
   var locality=0.18+0.82*Math.exp(-0.5*d*d);

   return focusedStretchValue(v,v+locality*(base-v),sp,focus);
}

function localizedStretchValue( v, stretch, localIntensity )
{
   if(stretch<=0)return v;
   var base=nonlinearStretchValue(v,stretch);
   var li=Math.max(0,Math.min(1,localIntensity));
   if(Math.abs(li-0.5)<1.0e-8)return base;

   // Smooth Gaussian localization in normalized signal space. A floor keeps
   // the transformation continuous across the image while strongly favoring
   // the selected tonal neighborhood.
   var sigma=0.22;
   var d=(v-li)/sigma;
   var locality=0.12+0.88*Math.exp(-0.5*d*d);
   return v+locality*(base-v);
}

function smoothStep01( t )
{
   t=Math.max(0,Math.min(1,t));
   return t*t*(3-2*t);
}

function tonalProtectionFactor( v, protectShadows, protectHighlights )
{
   // Fixed feather zones keep these controls simple and, importantly, local.
   // Shadow protection fades out by 25% signal; highlight protection begins
   // at 75%. Outside those zones the rest of the histogram is untouched.
   var f=1.0;
   if(protectShadows>0)
   {
      var shadowWeight=1.0-smoothStep01(v/0.25);
      f*=1.0-protectShadows*shadowWeight;
   }
   if(protectHighlights>0)
   {
      var highlightWeight=smoothStep01((v-0.75)/0.25);
      f*=1.0-protectHighlights*highlightWeight;
   }
   return Math.max(0,Math.min(1,f));
}

// ----------------------------------------------------------------------------
// Stage 5.8.0 quick starting stretch
// ----------------------------------------------------------------------------

function basicStretchCurve( v, gain, shoulderStart, shoulderStrength )
{
   v = Math.max( 0, Math.min( 1, v ) );
   if ( gain <= 1 )
      return v;

   // Strong nonlinear lift for linear data.
   var y = (gain*v)/(1 + (gain-1)*v);

   // Independent highlight shoulder. Faint/mid signal keeps the full gain;
   // only the bright end is progressively blended back toward the original
   // signal. This avoids allowing a bright M42 core to suppress the stretch
   // of the rest of the image.
   if ( v > shoulderStart )
   {
      var t = (v-shoulderStart)/Math.max( 1.0e-8, 1-shoulderStart );
      t = Math.max( 0, Math.min( 1, t ) );
      t = t*t*(3-2*t); // smoothstep
      var protect = shoulderStrength*t;
      y = y*(1-protect) + v*protect;
   }

   return Math.max( 0, Math.min( 1, y ) );
}

function percentileFromSortedArray( a, p )
{
   if ( a.length == 0 )
      return 0;

   var q = Math.max( 0, Math.min( 1, p ) )*(a.length-1);
   var i0 = Math.floor( q );
   var i1 = Math.min( a.length-1, i0+1 );
   var f = q-i0;
   return a[i0]*(1-f) + a[i1]*f;
}

function transformedValue( v, lo, hi, intensity, contrast, stretch )
{
   if ( hi <= lo )
      return v;

   var w = selectionWeight( v, lo, hi );
   if ( w <= 0 )
      return v;

   // Stage 5: first perform a genuine nonlinear stretch of the signal.
   var s = nonlinearStretchValue( v, stretch );

   // Local contrast remains centered on the selected signal range.
   // Positive values expand separation; negative values compress it.
   var center = 0.5*(lo+hi);
   var gain = Math.pow( 2, contrast );
   var c = center + (s-center)*gain;

   // Intensity is retained as a fine local brightness trim.
   var shifted = c + intensity*(hi-lo)*0.5;
   shifted = Math.max( 0, Math.min( 1, shifted ) );

   // Feather into the untouched image at the selected range boundaries.
   return v + w*(shifted-v);
}


function transformedValueForRanges( v, ranges, intensity, contrast, stretch )
{
   if ( ranges.length == 0 )
      return v;

   // When feathered selections overlap, use the selection having the
   // strongest weight. This prevents multiple stretches from compounding.
   var bestWeight = 0;
   var bestValue = v;

   for ( var i = 0; i < ranges.length; ++i )
   {
      var r = ranges[i];
      var w = selectionWeight( v, r.low, r.high );
      if ( w > bestWeight )
      {
         bestWeight = w;
         bestValue = transformedValue( v, r.low, r.high,
                                       intensity, contrast, stretch );
      }
   }
   return bestValue;
}


function colorSimilarityWeight( r, g, b, sr, sg, sb, tolerance )
{
   var sum=r+g+b, ssum=sr+sg+sb;
   if ( sum <= 1.0e-10 || ssum <= 1.0e-10 )
      return 0;

   var rn=r/sum, gn=g/sum, bn=b/sum;
   var rs=sr/ssum, gs=sg/ssum, bs=sb/ssum;
   var dr=rn-rs, dg=gn-gs, db=bn-bs;
   var d=Math.sqrt(dr*dr+dg*dg+db*db);

   if ( tolerance < 0.001 ) tolerance=0.001;
   if ( d >= tolerance ) return 0;
   var t=1-d/tolerance;
   return t*t*(3-2*t);
}

// ----------------------------------------------------------------------------
// Busy / progress dialog used during full-resolution Apply
// ----------------------------------------------------------------------------

function SmartStretchBusyDialog( parent )
{
   this.__base__ = Dialog;
   this.__base__();

   this.windowTitle = "Smart Stretch — Updating Image";
   this.userResizable = false;
   this.minWidth = 340;

   this.message_Label = new Label( this );
   this.message_Label.useRichText = true;
   this.message_Label.wordWrapping = true;
   this.message_Label.text =
      "<b>Updating image…</b><br/>Applying Smart Stretch to the full-resolution image. Please wait…";

   this.note_Label = new Label( this );
   this.note_Label.wordWrapping = true;
   this.note_Label.text = "Controls are locked until the update finishes.";

   // Paint our own progress bar: avoids relying on undocumented progress
   // widgets/constants on this version of PixInsight/PJSR.
   this.progressValue = 0;
   this.progress_Bar = new Control( this );
   this.progress_Bar.setMinSize( 320, 22 );
   var busy = this;
   this.progress_Bar.onPaint = function()
   {
      var g = new Graphics( this );
      try
      {
         var w=this.width, h=this.height;
         g.fillRect( 0, 0, w, h, new Brush( 0xff303030 ) );
         var fill=Math.round( w*Math.max( 0, Math.min( 100,
            busy.progressValue ) )/100 );
         if(fill>0)
            g.fillRect( 0, 0, fill, h, new Brush( 0xff3885c8 ) );
         g.pen=new Pen( 0xffaaaaaa, 1 );
         g.drawLine( 0, 0, w-1, 0 );
         g.drawLine( 0, h-1, w-1, h-1 );
         g.drawLine( 0, 0, 0, h-1 );
         g.drawLine( w-1, 0, w-1, h-1 );
      }
      finally { g.end(); }
   };
   this.progress_Label = new Label( this );
   this.progress_Label.text = "0%";

   this.setProgress = function( value, stage )
   {
      this.progressValue=Math.max( 0, Math.min( 100, value ) );
      this.progress_Label.text = Math.round( this.progressValue ) + "%";
      if(stage!=null && stage.length>0)
         this.note_Label.text=stage;
      this.progress_Bar.update();
      this.progress_Label.update();
   };

   this._stBody = new VerticalSizer;
   this._stBody.margin = 12;
   this._stBody.spacing = 8;
   this._stBody.add( this.message_Label );
   this._stBody.add( this.note_Label );
   this._stBody.add( this.progress_Bar );
   this._stBody.add( this.progress_Label );
   STScreenFit.adjust(this);

   this.onClose = function()
   {
   };
}
SmartStretchBusyDialog.prototype = new Dialog;

// ----------------------------------------------------------------------------
// Smart Mask dialog
// ----------------------------------------------------------------------------

function SmartMaskDialog( owner )
{
   this.__base__ = Dialog;
   this.__base__();

   var self=this;
   this.owner=owner;
   this.windowTitle="Smart Mask";
   this.userResizable=true;
   this.maskImage=null;
   this.previewBitmap=null;
   this.previewDisplayX=0;
   this.previewDisplayY=0;
   this.previewSourceImage=null;
   this.detectionMode="auto";
   this.baseDetectedMask=null;
   this.lassoMode="subtract";
   this.lassoDrawing=false;
   this.lassoPoints=[];

   this.preview=new ScrollBox(this);
   this.preview.autoScroll=true;
   this.preview.tracking=true;
   this.preview.frameStyle=FrameStyle_Box;
   STScreenFit.preview(this.preview,1280,760,undefined,STScreenFit.px(this.preview,220));
   this.preview.viewport.onPaint=function(x0,y0,x1,y1)
   {
      var g=new Graphics(this);
      try
      {
         g.fillRect(x0,y0,x1,y1,new Brush(0xff101010));
         if(self.previewBitmap!=null)
            g.drawBitmap(self.previewDisplayX,self.previewDisplayY,self.previewBitmap);
         if(self.lassoDrawing && self.lassoPoints.length>0 && self.previewBitmap!=null)
         {
            g.pen=new Pen(0xffffff00,2);
            var sx=self.previewBitmap.width/self.maskImage.width;
            var sy=self.previewBitmap.height/self.maskImage.height;
            for(var li=1;li<self.lassoPoints.length;++li)
               g.drawLine(
                  self.previewDisplayX+Math.round(self.lassoPoints[li-1].x*sx),
                  self.previewDisplayY+Math.round(self.lassoPoints[li-1].y*sy),
                  self.previewDisplayX+Math.round(self.lassoPoints[li].x*sx),
                  self.previewDisplayY+Math.round(self.lassoPoints[li].y*sy));
         }
      }
      finally { g.end(); }
   };

   this.title_Label=new Label(this);
   this.title_Label.useRichText=true;
   this.title_Label.text="<b>SMART MASK</b><br/><i>Detect the main object and associated faint structure.</i>";

   this.auto_Radio=new RadioButton(this); this.auto_Radio.text=STHoverCaption(this.auto_Radio,"Auto",0); this.auto_Radio.checked=true;
   this.nebula_Radio=new RadioButton(this); this.nebula_Radio.text=STHoverCaption(this.nebula_Radio,"Nebula",0);
   this.galaxy_Radio=new RadioButton(this); this.galaxy_Radio.text=STHoverCaption(this.galaxy_Radio,"Galaxy",0);

   this.sensitivity_Control=new NumericControl(this);
   this.sensitivity_Control.label.text=STHoverCaption(this.sensitivity_Control,"Detection Sensitivity",2);
   this.sensitivity_Control.setRange(0,100);
   this.sensitivity_Control.slider.setRange(0,100);
   this.sensitivity_Control.setPrecision(0);
   this.sensitivity_Control.setValue(55);

   this.wisps_Control=new NumericControl(this);
   this.wisps_Control.label.text=STHoverCaption(this.wisps_Control,"Include Faint Wisps",2);
   this.wisps_Control.setRange(0,100);
   this.wisps_Control.slider.setRange(0,100);
   this.wisps_Control.setPrecision(0);
   this.wisps_Control.setValue(65);

   this.algorithm_Combo=STHoverAttach(new ComboBox(this),"Choose the automatic detection algorithm: Adaptive (MAD) or the legacy method.");
   this.algorithm_Combo.addItem("Adaptive (MAD)");
   this.algorithm_Combo.addItem("Legacy");
   this.algorithm_Combo.currentItem=0;
   this.suppressStars_CheckBox=new CheckBox(this);
   this.suppressStars_CheckBox.text=STHoverCaption(this.suppressStars_CheckBox,"Suppress stars during detection",0);
   this.suppressStars_CheckBox.checked=true;
   this.lassoKeep_Radio=new RadioButton(this);this.lassoKeep_Radio.text=STHoverCaption(this.lassoKeep_Radio,"Keep Inside",0);
   this.lassoSubtract_Radio=new RadioButton(this);this.lassoSubtract_Radio.text=STHoverCaption(this.lassoSubtract_Radio,"Subtract",0);this.lassoSubtract_Radio.checked=true;
   this.lassoClear_Button=new PushButton(this);this.lassoClear_Button.text=STHoverCaption(this.lassoClear_Button,"Clear Lasso Edits",0);

   this.status_Label=new Label(this);
   this.status_Label.wordWrapping=true;
   this.status_Label.text="Adjust controls to build the mask.";

   this.reset_Button=new PushButton(this); this.reset_Button.text=STHoverCaption(this.reset_Button,"Reset",0);
   this.cancel_Button=new PushButton(this); this.cancel_Button.text=STHoverCaption(this.cancel_Button,"Cancel",0);
   this.create_Button=new PushButton(this); this.create_Button.text=STHoverCaption(this.create_Button,"Create Mask",0);

   this.mode_Sizer=new HorizontalSizer;
   this.mode_Sizer.spacing=8;
   this.mode_Sizer.add(this.auto_Radio);this.mode_Sizer.add(this.nebula_Radio);
   this.mode_Sizer.add(this.galaxy_Radio);this.mode_Sizer.addStretch();

   this.control_Sizer=new VerticalSizer;
   this.control_Sizer.spacing=8;
   this.control_Sizer.add(this.title_Label);
   this.control_Sizer.addSpacing(6);
   this.control_Sizer.add(this.mode_Sizer);
   this.control_Sizer.add(this.sensitivity_Control);
   this.control_Sizer.add(this.wisps_Control);
   this.control_Sizer.add(this.algorithm_Combo);
   this.control_Sizer.add(this.suppressStars_CheckBox);
   var lm=new HorizontalSizer;lm.spacing=8;lm.add(this.lassoKeep_Radio);lm.add(this.lassoSubtract_Radio);lm.addStretch();
   this.control_Sizer.add(lm);this.control_Sizer.add(this.lassoClear_Button);
   this.control_Sizer.addSpacing(8);
   this.control_Sizer.add(this.status_Label);
   this.control_Sizer.addStretch();
   this.control_Sizer.add(this.reset_Button);

   this.body_Sizer=new HorizontalSizer;
   this.body_Sizer.spacing=10;
   this.body_Sizer.add(this.preview,100);
   this.maskControlsScroll=STScreenFit.panel(this,this.control_Sizer);this.body_Sizer.add(this.maskControlsScroll);

   this.bottom_Sizer=new HorizontalSizer;
   this.bottom_Sizer.spacing=8;this.bottom_Sizer.addStretch();
   this.bottom_Sizer.add(this.cancel_Button);this.bottom_Sizer.add(this.create_Button);

   this._stBody=new VerticalSizer;
   this._stBody.margin=10;this._stBody.spacing=8;
   this._stBody.add(this.body_Sizer,100);this._stBody.add(this.bottom_Sizer);this._stFooter=this.bottom_Sizer;

   this.pointInSmartLasso=function(x,y,p)
   {var inside=false;for(var i=0,j=p.length-1;i<p.length;j=i++){var xi=p[i].x,yi=p[i].y,xj=p[j].x,yj=p[j].y;
    if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)==0?1e-12:(yj-yi))+xi))inside=!inside;}return inside;};
   this.rebuildSmartMaskPreview=function()
   {var src=owner.workingImage,W=src.width,H=src.height,C=src.numberOfChannels,d=new Image(src);
    for(var y=0;y<H;++y)for(var x=0;x<W;++x){var m=self.maskImage.sample(x,y,0),a=.68*m;if(C>=3&&m>.005){
    d.setSample(d.sample(x,y,0)*(1-a)+a,x,y,0);d.setSample(d.sample(x,y,1)*(1-a),x,y,1);d.setSample(d.sample(x,y,2)*(1-a)+.72*a,x,y,2);}}
    if(self.previewSourceImage!=null)self.previewSourceImage.free();self.previewSourceImage=new Image(d);d.free();self.fitPreviewBitmap(self.previewSourceImage);};
   this.applySmartLasso=function()
   {if(self.maskImage==null||self.lassoPoints.length<3)return;for(var y=0;y<self.maskImage.height;++y)for(var x=0;x<self.maskImage.width;++x){
    var inside=self.pointInSmartLasso(x+.5,y+.5,self.lassoPoints);if((self.lassoMode=="subtract"&&inside)||(self.lassoMode=="keep"&&!inside))self.maskImage.setSample(0,x,y,0);}
    self.lassoPoints=[];self.lassoDrawing=false;self.rebuildSmartMaskPreview();};
   this.generateMask=function()
   {
      var src=owner.workingImage;
      if(src==null)return;
      if(!self.auto_Radio.checked&&!self.nebula_Radio.checked&&!self.galaxy_Radio.checked)
      {self.auto_Radio.checked=true;self.detectionMode="auto";}
      if(!self.lassoKeep_Radio.checked&&!self.lassoSubtract_Radio.checked)
      {self.lassoSubtract_Radio.checked=true;self.lassoMode="subtract";}
      self.status_Label.text="Detecting object and faint structure…";
      processEvents();

      var result=SmartMaskEngine.generate(src,{
         mode:self.detectionMode,
         sensitivity:self.sensitivity_Control.value/100,
         wisps:self.wisps_Control.value/100,
         suppressStars:self.suppressStars_CheckBox.checked,
         algorithm:self.algorithm_Combo.currentItem==0?"adaptive":"legacy"
      },function(p,t)
      {
         self.status_Label.text=t;
         if((Math.floor(p)%10)==0)processEvents();
      });

      console.writeln(format("[Smart Mask] Detection complete: %d x %d",
         result.mask.width,result.mask.height));
      if(self.maskImage!=null)self.maskImage.free();
      self.maskImage=result.mask;
      if(self.baseDetectedMask!=null)self.baseDetectedMask.free();
      self.baseDetectedMask=new Image(self.maskImage);
      self.lassoPoints=[];
      self.lassoDrawing=false;
      self.lassoEditsExist=false;

      console.writeln("[Smart Mask] maskImage stored");
      self.rebuildSmartMaskPreview();
      if(self.previewBitmap!=null)
         console.writeln(format("[Smart Mask] Preview bitmap: %d x %d",
            self.previewBitmap.width,self.previewBitmap.height));
      else
         console.warningln("[Smart Mask] Preview bitmap was not created");

      self.status_Label.text=(result.mode=="nebula"?"Nebula":"Galaxy")+
         " structure detected — drag preview to refine with lasso.";
   };

   this.lassoKeep_Radio.onCheck=function(v)
   {
      if(v){self.lassoSubtract_Radio.checked=false;self.lassoMode="keep";}
      else if(!self.lassoSubtract_Radio.checked)
      {self.lassoSubtract_Radio.checked=true;self.lassoMode="subtract";}
   };
   this.lassoSubtract_Radio.onCheck=function(v)
   {
      if(v){self.lassoKeep_Radio.checked=false;self.lassoMode="subtract";}
      else if(!self.lassoKeep_Radio.checked)
      {self.lassoSubtract_Radio.checked=true;self.lassoMode="subtract";}
   };
   this.lassoClear_Button.onClick=function(){if(self.baseDetectedMask==null)return;if(self.maskImage!=null)self.maskImage.free();
      self.maskImage=new Image(self.baseDetectedMask);self.lassoPoints=[];self.rebuildSmartMaskPreview();};
   this.preview.viewport.onMousePress=function(x,y,button,buttons,modifiers)
   {if(self.maskImage==null||self.previewBitmap==null)return;var ix=(x-self.previewDisplayX)*self.maskImage.width/self.previewBitmap.width;
    var iy=(y-self.previewDisplayY)*self.maskImage.height/self.previewBitmap.height;if(ix<0||iy<0||ix>=self.maskImage.width||iy>=self.maskImage.height)return;
    self.lassoDrawing=true;self.lassoPoints=[{x:ix,y:iy}];};
   this.preview.viewport.onMouseMove=function(x,y,buttonState,modifiers)
   {if(!self.lassoDrawing)return;var ix=(x-self.previewDisplayX)*self.maskImage.width/self.previewBitmap.width;
    var iy=(y-self.previewDisplayY)*self.maskImage.height/self.previewBitmap.height;ix=Math.max(0,Math.min(self.maskImage.width-1,ix));iy=Math.max(0,Math.min(self.maskImage.height-1,iy));
    var n=self.lassoPoints.length;if(n==0||Math.abs(ix-self.lassoPoints[n-1].x)+Math.abs(iy-self.lassoPoints[n-1].y)>1.5)self.lassoPoints.push({x:ix,y:iy});self.preview.viewport.update();};
   this.preview.viewport.onMouseRelease=function(){if(self.lassoDrawing)self.applySmartLasso();};
   this.updateMask=function(){self.generateMask();};
   this.auto_Radio.onCheck=function(v)
   {
      if(v){self.nebula_Radio.checked=false;self.galaxy_Radio.checked=false;self.detectionMode="auto";self.updateMask();}
      else if(!self.nebula_Radio.checked&&!self.galaxy_Radio.checked)
      {self.auto_Radio.checked=true;self.detectionMode="auto";}
   };
   this.nebula_Radio.onCheck=function(v)
   {
      if(v){self.auto_Radio.checked=false;self.galaxy_Radio.checked=false;self.detectionMode="nebula";self.updateMask();}
      else if(!self.auto_Radio.checked&&!self.galaxy_Radio.checked)
      {self.auto_Radio.checked=true;self.detectionMode="auto";}
   };
   this.galaxy_Radio.onCheck=function(v)
   {
      if(v){self.auto_Radio.checked=false;self.nebula_Radio.checked=false;self.detectionMode="galaxy";self.updateMask();}
      else if(!self.auto_Radio.checked&&!self.nebula_Radio.checked)
      {self.auto_Radio.checked=true;self.detectionMode="auto";}
   };
   this.sensitivity_Control.onValueUpdated=function(){self.status_Label.text="Sensitivity: "+self.sensitivity_Control.value.toFixed(0)+" (release slider to detect)";};
   this.sensitivity_Control.slider.onMouseRelease=function(){self.updateMask();};
   this.wisps_Control.onValueUpdated=function(){self.status_Label.text="Faint Wisps: "+self.wisps_Control.value.toFixed(0)+" (release slider to detect)";};
   this.wisps_Control.slider.onMouseRelease=function(){self.updateMask();};
   SmartTools.configureNumericInput(this.sensitivity_Control,function(){self.updateMask();});
   SmartTools.configureNumericInput(this.wisps_Control,function(){self.updateMask();});
   this.algorithm_Combo.onItemSelected=function(){self.updateMask();};
   this.suppressStars_CheckBox.onCheck=function(){self.updateMask();};
   this.reset_Button.onClick=function()
   {
      self.auto_Radio.checked=true;self.nebula_Radio.checked=false;self.galaxy_Radio.checked=false;
      self.detectionMode="auto";
      self.lassoKeep_Radio.checked=false;self.lassoSubtract_Radio.checked=true;self.lassoMode="subtract";
      self.algorithm_Combo.currentItem=0;
      self.sensitivity_Control.setValue(55);
      self.wisps_Control.setValue(65);self.suppressStars_CheckBox.checked=true;
      self.updateMask();
   };
   this.cancel_Button.onClick=function(){self.cancel();};
   this.create_Button.onClick=function()
   {
      if(self.maskImage==null)
      {
         console.warningln("[Smart Mask] Create Mask: no maskImage available");
         self.status_Label.text="Create Mask failed — no Smart Mask is available.";
         return;
      }
      console.writeln(format("[Smart Mask] Create Mask: returning %d x %d mask",
         self.maskImage.width,self.maskImage.height));
      owner.acceptSmartMask(self.maskImage);
      console.writeln("[Smart Mask] Mask transferred to Smart Stretch");
      self.ok();
   };

   this.onShow=function(){self.generateMask();};
   this.onResize=function()
   {
      if(self.previewSourceImage!=null)
         self.fitPreviewBitmap(self.previewSourceImage);
   };
}
SmartMaskDialog.prototype=new Dialog;

// ----------------------------------------------------------------------------
// Main dialog
// ----------------------------------------------------------------------------

function SmartStretchDialog(trainerWinnerMode,initialTarget)
{
   this.__base__ = Dialog;
   this.__base__();

   var self = this;
   this.nativeWorkspace = {}; // Cleanup also runs after the JavaScript fallback.
   this.nativeQuickWorkspace = {};
   this.nativeQuickFaintWorkspace = {};


   this.applicationInProgress = false;
   this.busyDialog = null;

   this.windowTitle = "Smart Stretch v" + VERSION;

   // -------------------------------------------------------------------------
   // Header
   // -------------------------------------------------------------------------

   // -------------------------------------------------------------------------
   // Image preview
   // -------------------------------------------------------------------------

   this.preview = new ScrollBox( this );
   this.preview.autoScroll = true;
   this.preview.tracking = true;
   this.preview.frameStyle = FrameStyle_Box;
   STScreenFit.preview(this.preview,1280,760,undefined,STScreenFit.px(this.preview,480));


   this.previewZoom=new STPreviewZoom(this,this.preview,function(){return self.previewBitmap;});
   this.previewBitmap = null;
   this.originalPreviewBitmap = null;
   this.processedPreviewBitmap = null;
   this.isProcessingPreview = false;
   this.activeView = null;
   this.sampleX = -1;
   this.sampleY = -1;
   this.clickHalfWidth = 0.025;
   this.intensityAmount = 0.0;
   this.contrastAmount = 0.0;
   this.basicStretchEnabled = false;
   this.autoHighContrastEnabled = false;
   this.autoColorBrightnessEnabled=false;
   this.autoBrightnessStrength=.35;
   this.autoVibranceStrength=.25;
   this.quickAnalysisRecipe = null;
   this.basicStretchFaintEnabled = false;
   this.basicStretchFaintParameters = null;
   this.quickNebulosityEnabled=false;
   this.quickNebulosityStrength=.35;
   this.quickNebulosityGuide=null;
   this.basicStretchLinearEnabled = false;
   this.basicStretchGain = 1.0;
   this.basicStretchBlack = 0.0;
   this.basicStretchShoulder = 0.70;
   this.basicStretchShoulderStrength = 0.84;
   this.quickStretchClipFraction = 0.0;

   // Manual mask/lasso state. Define before preview event handlers so PJSR's
   // static property analysis sees these properties before they are referenced.
   this.maskEdits = [];
   this.lassoActive = false;
   this.lassoMode = "subtract";
   this.lassoDrawing = false;
   this.lassoPoints = [];
   // Stage 5.8.0 undo/redo history. Snapshots store parameters/selections, not
   // preview bitmaps or masks, so history remains comparatively lightweight.
   this.history = [];
   this.historyIndex = -1;
   this.historyLimit = 40;
   this.historyRestoring = false;
   this.historyDragging = false;

   this.sourceImage = null;
   this.previewScaleX = 1.0;
   this.previewScaleY = 1.0;
   this.overlayEnabled = true;
   this.inverseSelection = false;
   this.overlayStrength = 0.55;
   this.overlayImage = null;
   // True internal 0..1 processing mask. 0 protects, 1 applies fully.
   this.processingMask = null;
   // Optional reusable Smart Mask returned by the dedicated Smart Mask dialog.
   this.smartMask = null;
   // Cached width of the winning selection at each pixel. This avoids
   // reevaluating every Signal/Color selection during every slider update.
   this.processingRangeWidth = null;
   // Cached local-mean image for the current working image/channel.
   this.localMeanCache = null;
   this.localMeanCacheChannel = "";
   this.sourceWorkingImage = null;
   this.workingImage = null;
   this.originalFullImage = null; // Unmodified original, retained for HDR.
   this.pendingSP = 0.5;
   this.committedSP = 0.5;
   this.applicationInProgress = false;
   this.selections = [];
   this.samplePoints = [];
   this.suppressRangeUpdate = false;
   this.adjustmentDragging = false;
   this.overlayStateBeforeDrag = true;
   this.adaptiveBoundaryTriggered = false;
   this.adaptiveBoundaryTriggerCount = 0;
   // Stage 5.8.0 spatial-selection settings.
   this.spatialMinimumPixels = 25;
   this.selectionMode = "symmetry";
   this.stretchFocus = "center";
   this.colorTolerance = 0.10;
   this.channelMode = "RGBK";

   this.preview.viewport.onPaint = function( x0, y0, x1, y1 )
   {
      var g = new Graphics( this );

      try
      {
         g.fillRect( x0, y0, x1, y1, new Brush( 0xff101010 ) );
         self.previewZoom.paint(g);

         if ( self.previewBitmap != null )
            g.drawBitmap( 0, 0, self.previewBitmap );self.previewZoom.nativeTiles.paint(g);
         // Stage 5.8.0 signal-range overlay. The luminance map is already reduced
         // to preview dimensions, so this never scans the full-resolution
         // image during painting.
         if ( self.overlayEnabled && self.overlayImage != null )
         {
            var ow = self.overlayImage.width;
            var oh = self.overlayImage.height;
            var step = 2;
            var focusRegions=self.signalFocusRegions();

            for ( var oy = 0; oy < oh; oy += step )
               for ( var ox = 0; ox < ow; ox += step )
               {
                  var maskValue = self.processingMask != null ?
                     self.processingMask.sample( ox, oy, 0 ) : (self.selectionMode=="symmetry"?1:0);
                  maskValue*=self.maskFocusWeight(self.overlayImage.sample(ox,oy,0),focusRegions);

                  if ( maskValue > 0 )
                  {
                     var localAlpha = Math.round(
                        255*self.overlayStrength*maskValue );
                     var localBrush = new Brush(
                        (localAlpha << 24) | 0x00ff00ff );
                     var dx0=Math.round(ox*self.workingToDisplayX);
                     var dy0=Math.round(oy*self.workingToDisplayY);
                     var dx1=Math.round(Math.min(ox+step,ow)*self.workingToDisplayX);
                     var dy1=Math.round(Math.min(oy+step,oh)*self.workingToDisplayY);
                     g.fillRect(dx0,dy0,dx1,dy1,localBrush);
                  }
               }
         }

         // Active lasso outline.
         if(self.lassoDrawing && self.lassoPoints.length>1)
         {
            g.pen=new Pen(0xffffff00,3);
            for(var lp=1;lp<self.lassoPoints.length;++lp)
               g.drawLine(
                  Math.round(self.lassoPoints[lp-1].x*self.workingToDisplayX),
                  Math.round(self.lassoPoints[lp-1].y*self.workingToDisplayY),
                  Math.round(self.lassoPoints[lp].x*self.workingToDisplayX),
                  Math.round(self.lassoPoints[lp].y*self.workingToDisplayY));
         }

         // Mark image-origin selections with crosshairs.
         for ( var sp = 0; sp < self.samplePoints.length; ++sp )
         {
            var pxm = Math.round(self.samplePoints[sp].x*self.previewScaleX*
                                  self.workingToDisplayX);
            var pym = Math.round(self.samplePoints[sp].y*self.previewScaleY*
                                  self.workingToDisplayY);
            g.pen = new Pen( 0xffffffff, 1 );
            g.drawLine( pxm-8, pym, pxm+8, pym );
            g.drawLine( pxm, pym-8, pxm, pym+8 );
         }
      }
      finally
      {
         g.end();
      }
   };


   /*
    * Stage 2 click-to-select.
    * ScrollBox mouse coordinates are viewport coordinates. Add the scroll
    * offsets to obtain coordinates in the rendered image.
    */
   this.preview.viewport.onMousePress = function( x, y, button, buttons, modifiers )
   {
      if(button!=MouseButton_Left)return;
      if(self.applicationInProgress)return;
      if ( self.activeView == null || self.previewBitmap == null )
         return;

      // STPreviewZoom maps viewport events into bitmap coordinates, including
      // zoom and scrolling, before this handler. Do not apply offsets twice.
      var px = Math.floor(x*self.displayToWorkingX);
      var py0 = Math.floor(y*self.displayToWorkingY);
      if(self.lassoActive)
      {
         if(self.workingImage==null || px<0 || py0<0 ||
            px>=self.workingImage.width || py0>=self.workingImage.height)return;
         self.lassoDrawing=true;
         self.lassoPoints=[{x:px,y:py0}];
         self.preview.viewport.update();
         return;
      }

      if(self.selectionMode=="lowcontrast"){
         self.status_Label.text="Low Contrast is automatic: enable Lasso to refine its single mask; click/multi-select is disabled.";
         return;
      }
      var py = py0;

      // Stage 5.8.0: selection samples the CURRENT displayed baseline.
      // workingImage is already in preview coordinates, so do not map back
      // to the original full-resolution active view.
      var image = self.workingImage;
      if ( image == null )
         return;

      var wx = Math.floor( px );
      var wy = Math.floor( py );
      if ( wx < 0 || wy < 0 || wx >= image.width || wy >= image.height )
         return;

      var value=self.signalValueAt(image,wx,wy);

      value = Math.max( 0, Math.min( 1, value ) );
      var ctrl = (modifiers & 0x02) != 0;
      // Raw Qt/PJSR Alt modifier bit. Kept numeric for compatibility with the
      // same PixInsight build where named modifier constants were unavailable.
      var alt = (modifiers & 0x04) != 0;

      // Store source-coordinate crosshair positions so existing drawing logic
      // remains compatible. Spatial component seeds stay in working-image coords.
      var ix = Math.floor( wx/Math.max(1.0e-8,self.previewScaleX) );
      var iy = Math.floor( wy/Math.max(1.0e-8,self.previewScaleY) );
      if(self.selectionMode=="symmetry")
      {
         self.choosePendingSP(value);
         self.histogram.centerOnSignal(self.pendingSP);
      }
      else if ( self.selectionMode == "color" && image.numberOfChannels >= 3 )
      {
         var cx=Math.floor(wx), cy=Math.floor(wy);
         if ( cx<0 ) cx=0;
         if ( cy<0 ) cy=0;
         if ( cx>=image.width ) cx=image.width-1;
         if ( cy>=image.height ) cy=image.height-1;
         var cr=image.sample(cx,cy,0);
         var cg=image.sample(cx,cy,1);
         var cb=image.sample(cx,cy,2);
         self.handleColorSelection(cr,cg,cb,value,ctrl,ix,iy,alt,cx,cy);
      }
      else
         self.handleSignalSelection(value,ctrl,ix,iy,alt,wx,wy);
   };

   this.preview.viewport.onMouseMove = function( x, y, buttons, modifiers )
   {
      if(self.applicationInProgress)return;
      if(!self.lassoActive || !self.lassoDrawing)return;
      var px=Math.floor(x*self.displayToWorkingX);
      var py=Math.floor(y*self.displayToWorkingY);
      if(self.workingImage==null)return;
      px=Math.max(0,Math.min(self.workingImage.width-1,px));
      py=Math.max(0,Math.min(self.workingImage.height-1,py));
      var n=self.lassoPoints.length;
      if(n==0 || Math.abs(px-self.lassoPoints[n-1].x)+
                 Math.abs(py-self.lassoPoints[n-1].y)>=3)
      {
         self.lassoPoints.push({x:px,y:py});
         self.preview.viewport.update();
      }
   };

   this.preview.viewport.onMouseRelease = function( x, y, button, buttons, modifiers )
   {
      if(self.applicationInProgress)return;
      if(!self.lassoActive || !self.lassoDrawing)return;
      self.lassoDrawing=false;
      if(self.lassoPoints.length>=3)
      {
         var copy=[];
         for(var i=0;i<self.lassoPoints.length;++i)
            copy.push({x:self.lassoPoints[i].x,y:self.lassoPoints[i].y});
         self.maskEdits.push({mode:self.lassoMode,points:copy});
         self.overlayEnabled=true;self.overlay_CheckBox.checked=true;
         self.rebuildProcessingMask();
         // Count the final zeroed region for immediate feedback.
         var affected=0;
         if(self.processingMask!=null)
            for(var ay=0;ay<self.processingMask.height;++ay)
               for(var ax=0;ax<self.processingMask.width;++ax)
                  if(self.pointInPolygon(ax+0.5,ay+0.5,copy) &&
                     self.processingMask.sample(ax,ay,0)<=1.0e-8)++affected;
         self.updateProcessedPreview();
         self.commitHistory();
         self.status_Label.text=self.lassoMode=="subtract" ?
            "Lasso: subtracted enclosed region ("+affected+" zero-mask px)" :
            "Lasso: kept enclosed region; mask outside removed";
      }
      self.lassoPoints=[];
      self.preview.viewport.update();
   };

   // -------------------------------------------------------------------------
   // Histogram
   // -------------------------------------------------------------------------

   this.histogram = new HistogramControl( this );

   
   this.zoomToPeak_Button = new PushButton( this );
   this.zoomToPeak_Button.text = STHoverCaption(this.zoomToPeak_Button,"Zoom To Peak",0);
   this.zoomToPeak_Button.toolTip =
      "Expand the histogram display to the meaningful occupied signal range. "
    + "Selections still use the true normalized 0..1 image values.";
   this.zoomToPeak_Button.onClick = function()
   {
      self.histogram.zoomToPeak();
   };

   this.centerSP_Button = new PushButton(this);
   this.centerSP_Button.text = STHoverCaption(this.centerSP_Button,"Center on SP",0);
   this.centerSP_Button.toolTip = "Center the histogram on the selected SP without changing its current zoom level. The full 0..1 view stays unchanged.";
   this.centerSP_Button.onClick = function(){
      if(self.applicationInProgress)return;
      self.histogram.centerOnSignal(self.pendingSP);
   };

   this.resetHistogramZoom_Button = new PushButton( this );
   this.resetHistogramZoom_Button.text = STHoverCaption(this.resetHistogramZoom_Button,"Reset Zoom",0);
   this.resetHistogramZoom_Button.toolTip =
      "Restore the histogram display to the full 0..1 signal range.";
   this.resetHistogramZoom_Button.onClick = function()
   {
      self.histogram.resetZoom();
   };

   this.histogramZoom_Sizer = new HorizontalSizer;
   this.histogramZoom_Sizer.spacing = 6;
   this.histogramZoom_Sizer.addStretch();
   this.histogramZoom_Sizer.add( this.zoomToPeak_Button );
   this.histogramZoom_Sizer.add( this.centerSP_Button );
   this.histogramZoom_Sizer.add( this.resetHistogramZoom_Button );
   this.spStatus_Label = new Label(this);
   this.spStatus_Label.text = "AS SP: active 0.5000 | selected 0.5000";
   this.commitSP_Button = new PushButton(this);
   this.commitSP_Button.text = STHoverCaption(this.commitSP_Button,"Commit Symmetry Point",0);
   this.commitSP_Button.toolTip =
      "Activate the selected SP for future stretch previews; clicking the histogram alone never recalculates the image.";
   this.histogramZoom_Sizer.add(this.spStatus_Label);
   this.histogramZoom_Sizer.add(this.commitSP_Button);
   this.commitSP_Button.onClick = function()
   {
      if(self.selectionMode!="symmetry")return;
      self.committedSP=self.pendingSP;
      self.selections=[{type:"symmetry",center:self.committedSP,
         low:self.committedSP,high:self.committedSP,spatial:false,spatialMask:null}];
      self.samplePoints=[];
      self.syncSelectionUI();
      self.updateProcessedPreview();
      self.commitHistory();
      self.status_Label.text=format("Committed AS Symmetry Point: %.7f",self.committedSP);
   };
this.histogram.onSignalClicked = function( value, ctrl )
   {
      if(self.applicationInProgress)return;
      value=Math.max(0,Math.min(1,value));
      if(self.histogram.selectionMode=="symmetry")
      {
         self.choosePendingSP(value);
         return;
      }
      if(self.histogram.selectionMode=="signal")
         self.handleSignalSelection(value,ctrl,-1,-1);
   };
   this.choosePendingSP = function(value)
   {
      self.pendingSP=Math.max(0,Math.min(1,value));
      self.updateSPDisplay();
      self.status_Label.text=format("Selected SP %.7f — click Commit Symmetry Point to use it",self.pendingSP);
   };
   this.autoPeakPendingSP=function(image)
   {
      if(self.selectionMode!="symmetry" || self.historyRestoring)return;
      image=image||self.workingImage;if(image==null)return;
      self.histogram.setHistogram(calculateHistogram(image,65536,self.channelMode));
      var peak=self.histogram.zoomToPeak();if(!peak)return;
      // Deterministic normalized offset, independent of screen/dialog size.
      // Change the selection only: active SP/selections/preview are untouched.
      self.choosePendingSP(Math.max(0,(peak.bin-0.5)/peak.bins));
      console.writeln("[Smart Stretch] Auto peak="+peak.value.toPrecision(15)+
         " | pending SP="+self.pendingSP.toPrecision(15)+" | Commit remains manual");
   };
   this.updateSPDisplay = function()
   {
      if(self.spStatus_Label==null)return;
      var active=self.committedSP;
      self.histogram.focusSP=self.committedSP;
      if(self.selections.length>0 && self.selectionType(self.selections[0])=="symmetry")
         active=self.selections[0].center;
      self.spStatus_Label.text=format("AS SP: active %.7f | selected %.7f",active,self.pendingSP);
      self.commitSP_Button.enabled=self.selectionMode=="symmetry" &&
         Math.abs(active-self.pendingSP)>1.0e-7;
      if(self.selectionMode=="symmetry")
         self.histogram.setRanges([{type:"symmetry",center:self.pendingSP,
            low:self.pendingSP,high:self.pendingSP}]);
   };
   this.channelWidth_Control=new Control(this);
   this.rgbkChannel_Radio=new RadioButton(this.channelWidth_Control);this.rgbkChannel_Radio.text=STHoverCaption(this.rgbkChannel_Radio,"RGB/K",0);this.rgbkChannel_Radio.checked=true;
   this.rChannel_Radio=new RadioButton(this.channelWidth_Control);this.rChannel_Radio.text=STHoverCaption(this.rChannel_Radio,"R",0);
   this.gChannel_Radio=new RadioButton(this.channelWidth_Control);this.gChannel_Radio.text=STHoverCaption(this.gChannel_Radio,"G",0);
   this.bChannel_Radio=new RadioButton(this.channelWidth_Control);this.bChannel_Radio.text=STHoverCaption(this.bChannel_Radio,"B",0);
   this.channel_Sizer=new HorizontalSizer;this.channel_Sizer.spacing=12;this.channel_Sizer.addStretch();
   this.channel_Sizer.add(this.rgbkChannel_Radio);this.channel_Sizer.add(this.rChannel_Radio);
   this.channel_Sizer.add(this.gChannel_Radio);this.channel_Sizer.add(this.bChannel_Radio);this.channel_Sizer.addStretch();

   this.setChannelModeUI=function(mode,commit)
   {
      self.channelMode=mode;
      self.invalidatePreviewCaches();
      self.rgbkChannel_Radio.checked=mode=="RGBK";self.rChannel_Radio.checked=mode=="R";
      self.gChannel_Radio.checked=mode=="G";self.bChannel_Radio.checked=mode=="B";
      self.histogram.setChannelMode(mode);
      if(self.workingImage!=null)
      {
         if(self.overlayImage!=null)self.overlayImage.free();
         self.overlayImage=self.buildOverlayMap(self.workingImage);
         self.histogram.setHistogram(calculateHistogram(self.workingImage, 2048,self.channelMode));
         var kept=[];
         for(var i=0;i<self.selections.length;++i)
            if(self.selectionType(self.selections[i])=="color" ||
               self.selectionType(self.selections[i])=="symmetry")
               kept.push(self.selections[i]);
         self.selections=kept;
         // A channel change invalidates image-origin crosshair samples, but the
         // numeric Symmetry Point itself remains valid and undoable.
         self.samplePoints=[];
         self.rebuildSpatialSelections();self.syncSelectionUI();self.updateProcessedPreview();
         if(commit!==false)self.autoPeakPendingSP();
      }
      if(commit!==false)self.commitHistory();
   };
   this.rgbkChannel_Radio.onCheck=function(v){if(v)self.setChannelModeUI("RGBK",true);};
   this.rChannel_Radio.onCheck=function(v){if(v)self.setChannelModeUI("R",true);};
   this.gChannel_Radio.onCheck=function(v){if(v)self.setChannelModeUI("G",true);};
   this.bChannel_Radio.onCheck=function(v){if(v)self.setChannelModeUI("B",true);};


   // -------------------------------------------------------------------------
   // Low control
   // -------------------------------------------------------------------------

   this.low_Control = new NumericControl( this );
   this.low_Control.label.text = STHoverCaption(this.low_Control,"Low:",2);
   this.low_Control.label.minWidth = 50;
   this.low_Control.setRange( 0.0, 1.0 );
   this.low_Control.slider.setRange( 0, 1000 );
   this.low_Control.setPrecision( 4 );
   this.low_Control.setValue( 0.0 );
   this.low_Control.toolTip =
      STHoverNumericText(this.low_Control,"Lower boundary of the selected histogram region.",2);

   // -------------------------------------------------------------------------
   // High control
   // -------------------------------------------------------------------------

   this.high_Control = new NumericControl( this );
   this.high_Control.label.text = STHoverCaption(this.high_Control,"High:",2);
   this.high_Control.label.minWidth = 50;
   this.high_Control.setRange( 0.0, 1.0 );
   this.high_Control.slider.setRange( 0, 1000 );
   this.high_Control.setPrecision( 4 );
   this.high_Control.setValue( 1.0 );
   this.high_Control.toolTip =
      STHoverNumericText(this.high_Control,"Upper boundary of the selected histogram region.",2);

   this.width_Control = new NumericControl( this );
   this.width_Control.label.text = STHoverCaption(this.width_Control,"Click range:",2);
   this.width_Control.label.minWidth = 70;
   this.width_Control.setRange( 0.001, 0.250 );
   this.width_Control.slider.setRange( 1, 250 );
   this.width_Control.setPrecision( 3 );
   this.width_Control.setValue( 0.025 );
   this.width_Control.toolTip =
      STHoverNumericText(this.width_Control,"Half-width applied to every signal range. Alt-click uses the same range, then keeps only the connected structure around the clicked pixel.",2);

   this.width_Control.onValueUpdated = function( value )
   {
      self.clickHalfWidth = value;

      if ( self.selections.length > 0 )
      {
         for ( var i = 0; i < self.selections.length; ++i )
         {
            if ( self.selectionType(self.selections[i]) != "color" )
            {
               self.selections[i].low =
                  Math.max( 0, self.selections[i].center-value );
               self.selections[i].high =
                  Math.min( 1, self.selections[i].center+value );
            }
         }
         self.rebuildSpatialSelections();
         self.syncSelectionUI();
      }
      self.commitHistory();
   };


   this.overlay_CheckBox = new CheckBox( this );
   this.overlay_CheckBox.text = STHoverCaption(this.overlay_CheckBox,"Selection Mask",0);
   this.overlay_CheckBox.checked = true;
   this.overlay_CheckBox.toolTip =
      "Show the selected stretch footprint, including Left/Center/Right focus and its soft transition. Other adjustments have independent effects.";

   this.overlay_CheckBox.onCheck = function( checked )
   {
      self.overlayEnabled = checked;
      self.preview.viewport.update();
      self.commitHistory();
   };

   this.inverseSelection_CheckBox = new CheckBox( this );
   this.inverseSelection_CheckBox.text = STHoverCaption(this.inverseSelection_CheckBox,"Inverse Selection",0);
   this.inverseSelection_CheckBox.checked = false;
   this.inverseSelection_CheckBox.toolTip =
      "Invert the final Selection Mask: protected pixels become selected and selected pixels become protected.";
   this.inverseSelection_CheckBox.onCheck = function( checked )
   {
      self.inverseSelection = checked;
      self.rebuildProcessingMask();
      self.updateProcessedPreview();
      self.commitHistory();
      self.preview.viewport.update();
   };

   this.maskOptions_Sizer = new HorizontalSizer;
   this.maskOptions_Sizer.spacing = 12;
   this.maskOptions_Sizer.add( this.overlay_CheckBox );
   this.maskOptions_Sizer.add( this.inverseSelection_CheckBox );
   this.maskOptions_Sizer.addStretch();

   this.overlayStrength_Control = new NumericControl( this );
   this.overlayStrength_Control.label.text = STHoverCaption(this.overlayStrength_Control,"Mask overlay strength:",2);
   this.overlayStrength_Control.label.minWidth = 100;
   this.overlayStrength_Control.setRange( 0.10, 1.00 );
   this.overlayStrength_Control.slider.setRange( 10, 100 );
   this.overlayStrength_Control.setPrecision( 2 );
   this.overlayStrength_Control.setValue( 0.55 );
   this.overlayStrength_Control.toolTip =
      STHoverNumericText(this.overlayStrength_Control,"Opacity of the magenta signal-range selection overlay.",2);

   this.overlayStrength_Control.onValueUpdated = function( value )
   {
      self.overlayStrength = value;
      self.preview.viewport.update();
      self.commitHistory();
   };

   this.selectionMode_Label = new Label( this );
   this.selectionMode_Label.text = "<b>Selection Mode</b>";
   this.selectionMode_Label.useRichText = true;

   this.selectionMode_Control=new Control(this);
   this.symmetryMode_Radio = new RadioButton( this.selectionMode_Control );
   this.symmetryMode_Radio.text = STHoverCaption(this.symmetryMode_Radio,"Adaptive Symmetry-Stretch (AS)",0);
   this.symmetryMode_Radio.checked = true;
   this.symmetryMode_Radio.toolTip =
      "GHS-inspired mode. Click the image or histogram to place the symmetry point (SP), the tonal pivot around which Stretch Factor operates.";

   this.signalMode_Radio = new RadioButton( this.selectionMode_Control );
   this.signalMode_Radio.text = STHoverCaption(this.signalMode_Radio,"Signal",0);
   this.signalMode_Radio.checked = false;

   this.colorMode_Radio = new RadioButton( this.selectionMode_Control );
   this.colorMode_Radio.text = STHoverCaption(this.colorMode_Radio,"Color",0);

   this.lowContrastMode_Radio=new RadioButton(this.selectionMode_Control);
   this.lowContrastMode_Radio.text="Low Contrast";
   this.lowContrastMode_Radio.toolTip="Automatically select low local contrast above the background/noise floor. One soft selection only; image/histogram clicks do not add selections. Lasso Keep Inside/Subtract remains available.";
   this.lowContrastCache=null;
   this.lowContrastSensitivity_Control=new NumericControl(this);
   this.lowContrastSensitivity_Control.label.text="Low Contrast sensitivity";
   this.lowContrastSensitivity_Control.setRange(0,100);this.lowContrastSensitivity_Control.slider.setRange(0,100);
   this.lowContrastSensitivity_Control.setPrecision(0);this.lowContrastSensitivity_Control.setValue(50);
   this.lowContrastSensitivity_Control.toolTip="Higher values include areas with more local contrast. Blank background and bright flat cores are suppressed. Review the Selection Mask.";
   this.lowContrastScale_Control=new NumericControl(this);
   this.lowContrastScale_Control.label.text="Detection scale (% of short side)";
   this.lowContrastScale_Control.setRange(.2,15);this.lowContrastScale_Control.slider.setRange(2,150);
   this.lowContrastScale_Control.setPrecision(1);this.lowContrastScale_Control.setValue(3);
   this.lowContrastScale_Control.toolTip="Radius of the local contrast measurement, relative to image size. Larger values detect broader weak-contrast areas.";
   var lowContrastChanged=function(){if(self.historyRestoring)return;self.lowContrastCache=null;if(self.selectionMode=="lowcontrast"){self.syncSelectionUI();self.updateProcessedPreview();self.commitHistory();}};
   this.lowContrastSensitivity_Control.onValueUpdated=lowContrastChanged;
   this.lowContrastScale_Control.onValueUpdated=lowContrastChanged;
   this.lowContrastMode_Radio.onCheck=function(checked){
      if(!checked||self.historyRestoring)return;
      self.selectionMode="lowcontrast";self.selections=[];self.samplePoints=[];self.sampleX=-1;self.sampleY=-1;
      self.lowContrastCache=null;self.syncSelectionUI();self.updateProcessedPreview();
      self.status_Label.text="Low Contrast: one automatic mask. Use Selection Mask to inspect; Lasso refines it. Multi-select is disabled.";
      self.commitHistory();
   };

   this.colorTolerance_Control = new NumericControl( this );
   this.colorTolerance_Control.label.text = STHoverCaption(this.colorTolerance_Control,"Color Tolerance",2);
   this.colorTolerance_Control.setRange( 0.010, 0.500 );
   this.colorTolerance_Control.slider.setRange( 10, 500 );
   this.colorTolerance_Control.setPrecision( 3 );
   this.colorTolerance_Control.setValue( this.colorTolerance );
   this.colorTolerance_Control.enabled = false;
   this.colorTolerance_Control.toolTip =
      STHoverNumericText(this.colorTolerance_Control,"Higher tolerance includes a wider range of similar colors.",2);

   this.connectedColor_CheckBox=new CheckBox(this);this.connectedColor_CheckBox.text="Include connected faint color";this.connectedColor_CheckBox.checked=false;
   this.connectedColor_CheckBox.toolTip="Grow strong color matches into connected dimmer pixels with looser color similarity. Only used in Color selection mode.";
   this.faintColorReach_Control=new NumericControl(this);this.faintColorReach_Control.label.text="Faint color reach";this.faintColorReach_Control.setRange(0,1);this.faintColorReach_Control.slider.setRange(0,100);this.faintColorReach_Control.setPrecision(2);this.faintColorReach_Control.setValue(.5);this.faintColorReach_Control.enabled=false;
   this.faintColorReach_Control.toolTip="Higher values extend farther and relax color matching. Review the mask for background leakage.";
   this.connectedColor_CheckBox.onCheck=function(){self.syncSelectionUI();self.updateProcessedPreview();self.commitHistory();};
   this.faintColorReach_Control.onValueUpdated=function(){if(!self.historyRestoring){self.syncSelectionUI();self.updateProcessedPreview();self.commitHistory();}};
   this.symmetryMode_Radio.onCheck = function( checked )
   {
      if(!checked)return;
      self.selectionMode="symmetry";
      if(self.selections.length!=1 || self.selectionType(self.selections[0])!="symmetry")
      {
        self.pendingSP=0.5;
         self.committedSP=0.5;
         self.selections=[{type:"symmetry",center:0.5,low:0.5,high:0.5,
                           spatial:false,spatialMask:null}];
         self.samplePoints=[];
      }
      self.colorTolerance_Control.enabled=false;
      self.width_Control.enabled=false;
      self.syncSelectionUI();
      self.status_Label.text="Selection mode: Symmetry Point — click image or histogram to set SP";
      self.commitHistory();
   };

   this.signalMode_Radio.onCheck = function( checked )
   {
      if ( !checked ) return;
      self.selectionMode="signal";
      if(self.selections.length==1 && self.selectionType(self.selections[0])=="symmetry")
      {
         self.selections=[];
         self.samplePoints=[];
      }
      self.colorTolerance_Control.enabled=false;
      self.width_Control.enabled=true;
      self.syncSelectionUI();
      self.status_Label.text="Selection mode: Signal";
      self.commitHistory();
   };

   this.colorMode_Radio.onCheck = function( checked )
   {
      if ( !checked ) return;
      self.selectionMode="color";
      if(self.selections.length==1 && self.selectionType(self.selections[0])=="symmetry")
      {
         self.selections=[];
         self.samplePoints=[];
      }
      self.colorTolerance_Control.enabled=true;
      self.width_Control.enabled=false;
      self.low_Control.enabled=false;
      self.high_Control.enabled=false;
      self.syncSelectionUI();
      self.status_Label.text="Selection mode: Color — histogram selection locked";
      self.commitHistory();
   };

   this.colorTolerance_Control.onValueUpdated = function( value )
   {
      self.colorTolerance=value;
      for ( var i=0; i<self.selections.length; ++i )
         if ( self.selectionType(self.selections[i])=="color" )
         {
            self.selections[i].tolerance=self.colorTolerance;
            if ( self.selections[i].spatial )
               self.buildColorSpatialComponent(self.selections[i]);
         }
      self.syncSelectionUI();
      self.commitHistory();
   };

   this.selectionMode_Sizer = new HorizontalSizer;
   this.selectionMode_Sizer.spacing = 12;
   this.selectionMode_Sizer.add( this.selectionMode_Label );
   this.selectionMode_Sizer.add( this.symmetryMode_Radio );
   this.selectionMode_Sizer.add( this.signalMode_Radio );
   this.selectionMode_Sizer.add( this.colorMode_Radio );
   this.selectionMode_Sizer.add(this.lowContrastMode_Radio);
   this.selectionMode_Sizer.addStretch();

   this.lassoMode_Control=new Control(this);
   this.lasso_Label=new Label(this);
   this.lasso_Label.text="<b>Mask Lasso</b>";
   this.lasso_Label.useRichText=true;
   this.lassoEnable_CheckBox=new CheckBox(this);
   this.lassoEnable_CheckBox.text=STHoverCaption(this.lassoEnable_CheckBox,"Lasso",0);
   this.lassoSubtract_Radio=new RadioButton(this.lassoMode_Control);
   this.lassoSubtract_Radio.text=STHoverCaption(this.lassoSubtract_Radio,"Subtract",0);
   this.lassoSubtract_Radio.checked=true;
   this.lassoKeep_Radio=new RadioButton(this.lassoMode_Control);
   this.lassoKeep_Radio.text=STHoverCaption(this.lassoKeep_Radio,"Keep Inside",0);
   this.lassoClear_Button=new PushButton(this);
   this.lassoClear_Button.text=STHoverCaption(this.lassoClear_Button,"Clear Lasso Edits",0);
   this.smartMask_Button=new PushButton(this);
   this.smartMask_Button.text=STHoverCaption(this.smartMask_Button,"Smart Mask…",0);
   this.smartMask_Button.toolTip=
      "Open structure-aware Nebula/Galaxy mask detection in a separate preview dialog.";
   this.lasso_Sizer=new HorizontalSizer;
   this.lasso_Sizer.spacing=8;
   this.lasso_Sizer.add(this.lasso_Label);
   this.lasso_Sizer.add(this.lassoEnable_CheckBox);
   this.lasso_Sizer.add(this.lassoSubtract_Radio);
   this.lasso_Sizer.add(this.lassoKeep_Radio);
   this.lasso_Sizer.add(this.lassoClear_Button);
   this.lasso_Sizer.add(this.smartMask_Button);
   this.lasso_Sizer.addStretch();

   this.lassoEnable_CheckBox.onCheck=function(v)
   {
      self.lassoActive=v;
      self.lassoDrawing=false;self.lassoPoints=[];
      self.status_Label.text=v ?
         "Lasso active — drag a closed region on the preview" : "Lasso disabled";
      self.preview.viewport.update();
      self.commitHistory();
   };
   this.lassoSubtract_Radio.onCheck=function(v)
   {
      if(v)
      {
         self.lassoMode="subtract";
         self.commitHistory();
      }
   };
   this.lassoKeep_Radio.onCheck=function(v)
   {
      if(v)
      {
         self.lassoMode="keep";
         self.commitHistory();
      }
   };
   this.lassoClear_Button.onClick=function()
   {
      if(self.maskEdits.length==0)return;
      self.maskEdits=[];
      self.rebuildProcessingMask();
      self.updateProcessedPreview();
      self.commitHistory();
      self.status_Label.text="Lasso mask edits cleared";
   };


   this.acceptSmartMask=function(mask)
   {
      console.writeln(format("[Smart Stretch] Accepting Smart Mask: %d x %d",
         mask.width,mask.height));
      if(self.smartMask!=null)self.smartMask.free();
      self.smartMask=new Image(mask);

      self.rebuildProcessingMask();
      self.invalidatePreviewCaches();
      self.updateProcessedPreview();
      self.preview.viewport.update();
      self.commitHistory();
      console.writeln("[Smart Stretch] Smart Mask accepted and preview rebuilt");
      self.status_Label.text="Smart Mask active — applied to current Smart Stretch preview";
   };
   this.smartMask_Button.onClick=function()
   {
      if(self.workingImage==null)return;
      var d=new SmartMaskDialog(self);
      STScreenFit.execute(d);
   };

   this.intensity_Control = new NumericControl( this );
   this.intensity_Control.label.text = STHoverCaption(this.intensity_Control,"Intensity:",2);
   this.intensity_Control.label.minWidth = 70;
   this.intensity_Control.setRange( -1.0, 1.0 );
   this.intensity_Control.slider.setRange( 0, 1000 );
   this.intensity_Control.setPrecision( 3 );
   this.intensity_Control.setValue( 0.0 );
   this.intensity_Control.toolTip =
      STHoverNumericText(this.intensity_Control,"Brighten or darken only the selected signal range. Stage 5.8.0 increases Intensity authority for stronger local brightness adjustment.",2);

   this.contrast_Control = new NumericControl( this );
   this.contrast_Control.label.text = STHoverCaption(this.contrast_Control,"Contrast:",2);
   this.contrast_Control.label.minWidth = 70;
   this.contrast_Control.setRange( -2.0, 2.0 );
   this.contrast_Control.slider.setRange( 0, 1000 );
   this.contrast_Control.setPrecision( 3 );
   this.contrast_Control.setValue( 0.0 );
   this.contrast_Control.toolTip =
      STHoverNumericText(this.contrast_Control,"Local detail contrast. Positive values emphasize small-scale structure; negative values soften it. The effect is blended through the Selection Mask.",2);

   this.stretch_Control = new NumericControl( this );
   this.stretch_Control.label.text = STHoverCaption(this.stretch_Control,"Stretch Factor:",2);
   this.stretch_Control.label.minWidth = 70;
   this.stretch_Control.setRange( 0.0, 18 );
   this.stretch_Control.slider.setRange( 0, 1200 );
   this.stretch_Control.setPrecision( 3 );
   this.stretch_Control.setValue( 0.0 );
   this.stretch_Control.toolTip =
      STHoverNumericText(this.stretch_Control,"GHS-style stretch strength. Higher values increase nonlinear stretching while leaving unselected signal untouched.",2);
   this.low_Control.slider.minWidth = 520;
   this.high_Control.slider.minWidth = 520;
   this.width_Control.slider.minWidth = 520;
   this.intensity_Control.slider.minWidth = 520;
   this.contrast_Control.slider.minWidth = 520;
   this.stretch_Control.slider.minWidth = 520;

   this.stretchFocus_Control=new Control(this);
   this.stretchFocus_Control.sizer=new HorizontalSizer;
   this.stretchFocus_Control.sizer.spacing=8;
   this.stretchFocus_Label=new Label(this.stretchFocus_Control);
   this.stretchFocus_Label.text="Stretch Focus:";
   this.stretchFocus_Control.sizer.add(this.stretchFocus_Label);
   this.setStretchFocus=function(focus){
      self.stretchFocus=focus=="left"||focus=="right"?focus:"center";
      self.stretchLeft_Radio.checked=self.stretchFocus=="left";
      self.stretchCenter_Radio.checked=self.stretchFocus=="center";
      self.stretchRight_Radio.checked=self.stretchFocus=="right";
      self.histogram.stretchFocus=self.stretchFocus;self.histogram.update();
   };
   function addFocusRadio(name,text,focus,tip){
      var radio=new RadioButton(self.stretchFocus_Control);
      radio.text=STHoverCaption(radio,text,0);radio.toolTip=tip;radio.checked=focus=="center";
      radio.onCheck=function(checked){
         if(!checked||self.historyRestoring)return;
         self.setStretchFocus(focus);
         self.stretchCurveCache=null;self.lowContrastCache=null;self.nativeTableCache=null;self.nativeContext=null;
         self.liveAdjustmentUpdate();self.preview.viewport.update();self.commitHistory();
      };
      self[name]=radio;self.stretchFocus_Control.sizer.add(radio);
   }
   addFocusRadio("stretchLeft_Radio","Left","left","Stretch only values below SP; values at and above SP retain their Stretch Factor input.");
   addFocusRadio("stretchCenter_Radio","Center","center","Stretch both sides of SP using the established Smart Stretch curve (default).");
   addFocusRadio("stretchRight_Radio","Right","right","Stretch only values above SP; values at and below SP retain their Stretch Factor input.");
   this.stretchFocus_Control.sizer.addStretch();
   this.stretchFocus_Control.toolTip="Available in SP and Signal selection modes. Signal mode uses the picked signal center; overlapping picks use the closest center relative to range width. Other adjustments remain independent.";

   // GHS-inspired Local Intensity: controls where the Stretch Factor is
   // concentrated in signal space. 0 = shadows, 0.5 = midtones, 1 = highlights.
   // At the neutral value of 0.5 the existing Stretch Factor curve is retained.
   this.localIntensity_Control = new NumericControl( this );
   this.localIntensity_Control.label.text = STHoverCaption(this.localIntensity_Control,"Local Intensity:",2);
   this.localIntensity_Control.label.minWidth = 100;
   this.localIntensity_Control.setRange( 0.0, 1.0 );
   this.localIntensity_Control.slider.setRange( 0, 1000 );
   this.localIntensity_Control.setPrecision( 3 );
   this.localIntensity_Control.setValue( 0.5 );
   this.localIntensity_Control.slider.minWidth = 520;
   this.localIntensity_Control.toolTip =
      STHoverNumericText(this.localIntensity_Control,"GHS-inspired localization control. Move left to concentrate Stretch Factor toward shadows/faint signal; move right to concentrate it toward brighter signal. 0.5 is neutral.",2);

   // Protection controls intentionally do NOT reshape the stretch curve.
   // They attenuate the requested adjustment only near the tonal extremes.
   this.protectShadows_Control = new NumericControl( this );
   this.protectShadows_Control.label.text = STHoverCaption(this.protectShadows_Control,"Protect Shadows:",2);
   this.protectShadows_Control.label.minWidth = 100;
   this.protectShadows_Control.setRange( 0.0, 1.0 );
   this.protectShadows_Control.slider.setRange( 0, 1000 );
   this.protectShadows_Control.setPrecision( 3 );
   this.protectShadows_Control.setValue( 0.0 );
   this.protectShadows_Control.slider.minWidth = 520;
   this.protectShadows_Control.toolTip =
      STHoverNumericText(this.protectShadows_Control,"Protect the darkest tones without reshaping the rest of the stretch. 0 = off; 1 = maximum shadow protection.",2);

   this.protectHighlights_Control = new NumericControl( this );
   this.protectHighlights_Control.label.text = STHoverCaption(this.protectHighlights_Control,"Protect Highlights:",2);
   this.protectHighlights_Control.label.minWidth = 100;
   this.protectHighlights_Control.setRange( 0.0, 1.0 );
   this.protectHighlights_Control.slider.setRange( 0, 1000 );
   this.protectHighlights_Control.setPrecision( 3 );
   this.protectHighlights_Control.setValue( 0.0 );
   this.protectHighlights_Control.slider.minWidth = 520;
   this.protectHighlights_Control.toolTip =
      STHoverNumericText(this.protectHighlights_Control,"Protect the brightest tones without pulling back shadows or midtones. 0 = off; 1 = maximum highlight protection.",2);

   this.adaptiveBoundary_Control = new NumericControl( this );
   this.adaptiveBoundary_Control.label.text = STHoverCaption(this.adaptiveBoundary_Control,"Adaptive Boundary:",2);
   this.adaptiveBoundary_Control.label.minWidth = 100;
   this.adaptiveBoundary_Control.setRange( 0.0, 1.0 );
   this.adaptiveBoundary_Control.slider.setRange( 0, 1000 );
   this.adaptiveBoundary_Control.setPrecision( 3 );
   this.adaptiveBoundary_Control.setValue( 0.65 );
   this.adaptiveBoundary_Control.slider.minWidth = 520;
   this.adaptiveBoundary_Control.toolTip =
      STHoverNumericText(this.adaptiveBoundary_Control,"Detect processing-created edges aligned with the mask boundary and locally reduce processing before the mask becomes visible. 0 = off.",2);

   this.hdrEnable_CheckBox = new CheckBox( this );
   this.hdrEnable_CheckBox.text = STHoverCaption(this.hdrEnable_CheckBox,"Enable Reference-Aware HDR",0);
   this.hdrEnable_CheckBox.checked = false;
   this.hdrEnable_CheckBox.toolTip =
      "Enable HDR compression and pre-stretch color recovery. Disabled by default for isolated testing.";

   this.hdrStrength_Control = new NumericControl( this );
   this.hdrStrength_Control.label.text = STHoverCaption(this.hdrStrength_Control,"HDR Strength:",2);
   this.hdrStrength_Control.label.minWidth = 100;
   this.hdrStrength_Control.setRange( 0.0, 1.0 );
   this.hdrStrength_Control.slider.setRange( 0, 1000 );
   this.hdrStrength_Control.setPrecision( 3 );
   this.hdrStrength_Control.setValue( 0.50 );
   this.hdrStrength_Control.slider.minWidth = 520;
   this.hdrStrength_Control.toolTip =
      STHoverNumericText(this.hdrStrength_Control,"Compress excessive local brightness while retaining structure. Active only when Reference-Aware HDR is enabled.",2);

   this.hdrScale_Control = new NumericControl( this );
   this.hdrScale_Control.label.text = STHoverCaption(this.hdrScale_Control,"HDR Scale:",2);
   this.hdrScale_Control.label.minWidth = 100;
   this.hdrScale_Control.setRange( 0.0, 1.0 );
   this.hdrScale_Control.slider.setRange( 0, 1000 );
   this.hdrScale_Control.setPrecision( 3 );
   this.hdrScale_Control.setValue( 0.45 );
   this.hdrScale_Control.slider.minWidth = 520;
   this.hdrScale_Control.toolTip =
      STHoverNumericText(this.hdrScale_Control,"Spatial scale of HDR compression. Lower values target smaller bright structures; higher values target broader bright cores.",2);
   this.hdrStrength_Control.enabled = false;
   this.hdrScale_Control.enabled = false;

   this.range_Label = new Label( this );
   this.range_Label.text = "<b>Selected range:</b> 0.0000 — 1.0000";
   this.range_Label.useRichText = true;

   this.source_Label = new Label( this );
   this.source_Label.text = "Source: none";
   this.source_Label.wordWrapping = true;

   this.status_Label = new Label( this );
   this.status_Label.text = "Ready";
   this.status_Label.toolTip =
      "Shows whether the stretch preview is being recalculated.";

   this.before_CheckBox = new CheckBox( this );
   this.before_CheckBox.text = STHoverCaption(this.before_CheckBox,"Show Before",0);
   this.before_CheckBox.toolTip =
      "Toggle between the original preview and the most recently updated stretch preview.";
   this.before_CheckBox.checked = false;

   this.buildSpatialComponent = function( selection )
   {
      // Signal selections only. Color spatial selections use
      // buildColorSpatialComponent(), which has no low/high properties.
      if ( self.overlayImage == null )
         return false;

      var W=self.overlayImage.width, H=self.overlayImage.height;
      var sx=selection.seedX, sy=selection.seedY;
      if ( sx < 0 || sy < 0 || sx >= W || sy >= H )
         return false;

      var seedValue=self.overlayImage.sample(sx,sy,0);
      if ( selectionWeight(seedValue,selection.low,selection.high) <= 0 )
         return false;

      var visited=new Array(W*H);
      var component=new Array(W*H);
      for ( var z=0; z<W*H; ++z ) visited[z]=false;

      // Queue encoded pixel indices. 8-connectivity keeps diagonal nebular
      // structures connected while still rejecting unrelated islands.
      var queue=new Array(W*H);
      var head=0, tail=0;
      var seedIndex=sy*W+sx;
      queue[tail++]=seedIndex;
      visited[seedIndex]=true;
      var count=0;

      while ( head < tail )
      {
         var p=queue[head++];
         var py=Math.floor(p/W), px=p-py*W;
         component[p]=true;
         ++count;

         for ( var dy=-1; dy<=1; ++dy )
            for ( var dx=-1; dx<=1; ++dx )
            {
               if ( dx==0 && dy==0 ) continue;
               var nx=px+dx, ny=py+dy;
               if ( nx<0 || ny<0 || nx>=W || ny>=H ) continue;
               var ni=ny*W+nx;
               if ( visited[ni] ) continue;
               visited[ni]=true;
               var v=self.overlayImage.sample(nx,ny,0);
               if ( selectionWeight(v,selection.low,selection.high) > 0 )
                  queue[tail++]=ni;
            }
      }

      if ( count < self.spatialMinimumPixels )
      {
         selection.spatialMask=null;
         selection.spatialPixelCount=count;
         return false;
      }

      selection.spatialMask=component;
      selection.spatialPixelCount=count;
      return true;
   };

   this.rebuildSpatialSelections = function()
   {
      for ( var i=0; i<self.selections.length; ++i )
         if ( self.selections[i].spatial )
         {
            if ( self.selectionType(self.selections[i])=="color" )
               self.buildColorSpatialComponent(self.selections[i]);
            else
               self.buildSpatialComponent(self.selections[i]);
         }
   };

   this.effectiveSelectionWeight = function( selection, v, x, y )
   {
      var st=self.selectionType(selection);
      var w = st=="symmetry" ? 1.0 :
         (st=="color" ? self.colorSelectionWeightAt(selection,x,y) :
         selectionWeight(v,selection.low,selection.high));
      if ( w<=0 ) return 0;
      if ( selection.spatial )
      {
         if ( selection.spatialMask==null ) return 0;
         if ( !selection.spatialMask[y*self.overlayImage.width+x] ) return 0;
      }
      return w;
   };

   this.hasSpatialSelections = function()
   {
      for ( var i=0; i<self.selections.length; ++i )
         if ( self.selections[i].spatial )
            return true;
      return false;
   };

   this.copySelectionForHistory = function( s )
   {
      var q={};
      for ( var k in s )
         if ( k!="spatialMask" )
            q[k]=s[k];
      q.spatialMask=null;
      return q;
   };

   this.captureHistoryState = function()
   {
      var a=[];
      for ( var i=0; i<self.selections.length; ++i )
         a.push(self.copySelectionForHistory(self.selections[i]));
      var pts=[];
      for ( var p=0; p<self.samplePoints.length; ++p )
         pts.push({x:self.samplePoints[p].x,y:self.samplePoints[p].y,
                   center:self.samplePoints[p].center,
                   spatial:!!self.samplePoints[p].spatial});
      var edits=[];
      for(var e=0;e<self.maskEdits.length;++e)
      {
         var ep=[];
         for(var q=0;q<self.maskEdits[e].points.length;++q)
            ep.push({x:self.maskEdits[e].points[q].x,y:self.maskEdits[e].points[q].y});
         edits.push({mode:self.maskEdits[e].mode,points:ep});
      }
      return {
         selections:a, samplePoints:pts, maskEdits:edits,
         pendingSP:self.pendingSP, committedSP:self.committedSP,
         selectionMode:self.selectionMode,
         lowContrastSensitivity:self.lowContrastSensitivity_Control.value,lowContrastScale:self.lowContrastScale_Control.value,
         channelMode:self.channelMode,
         lassoActive:self.lassoActive,
         lassoMode:self.lassoMode,
         clickHalfWidth:self.clickHalfWidth,
         colorTolerance:self.colorTolerance,connectedColor:self.connectedColor_CheckBox.checked,faintColorReach:self.faintColorReach_Control.value,
         intensity:self.intensity_Control.value,
         contrast:self.contrast_Control.value,
         stretch:self.stretch_Control.value,
         localIntensity:self.localIntensity_Control.value,
         stretchFocus:self.stretchFocus,
         protectShadows:self.protectShadows_Control.value,
         protectHighlights:self.protectHighlights_Control.value,
         adaptiveBoundary:self.adaptiveBoundary_Control.value,
         hdrEnabled:self.hdrEnable_CheckBox.checked,
         hdrStrength:self.hdrStrength_Control.value,
         hdrScale:self.hdrScale_Control.value,
         overlayEnabled:self.overlayEnabled,
         inverseSelection:self.inverseSelection,
         overlayStrength:self.overlayStrength,
         basicStretchEnabled:self.basicStretchEnabled,
         autoHighContrastEnabled:self.autoHighContrastEnabled,
         autoColorBrightnessEnabled:self.autoColorBrightnessEnabled,
         autoBrightnessStrength:self.autoBrightnessStrength,
         autoVibranceStrength:self.autoVibranceStrength,
         quickAnalysisRecipe:self.quickAnalysisRecipe?SSTCopy(self.quickAnalysisRecipe):null,
         basicStretchFaintEnabled:self.basicStretchFaintEnabled,
         basicStretchFaintParameters:self.basicStretchFaintParameters==null?null:self.basicStretchFaintParameters.map(function(p){return {black:p.black,midtones:p.midtones};}),
         basicStretchLinearEnabled:self.basicStretchLinearEnabled,
         quickNebulosityEnabled:self.quickNebulosityEnabled,
         quickNebulosityStrength:self.quickNebulosityStrength,
         basicStretchGain:self.basicStretchGain,
         basicStretchBlack:self.basicStretchBlack,
         basicStretchShoulder:self.basicStretchShoulder,
         basicStretchShoulderStrength:self.basicStretchShoulderStrength,
         quickStretchClipFraction:self.quickStretchClipFraction
      };
   };

   this.historySignature = function( s )
   {
      // spatialMask is intentionally excluded by captureHistoryState().
      return JSON.stringify(s);
   };

   this.updateHistoryButtons = function()
   {
      if ( self.undo_Button!=null )
         self.undo_Button.enabled=self.historyIndex>0;
      if ( self.redo_Button!=null )
         self.redo_Button.enabled=self.historyIndex>=0 &&
                                  self.historyIndex<self.history.length-1;
   };

   this.commitHistory = function()
   {
      if ( self.historyRestoring || self.historyDragging )
         return;
      var s=self.captureHistoryState();
      if ( self.historyIndex>=0 &&
           self.historySignature(self.history[self.historyIndex])==
           self.historySignature(s) )
      {
         self.updateHistoryButtons();
         return;
      }
      if ( self.historyIndex<self.history.length-1 )
         self.history.splice(self.historyIndex+1,
                             self.history.length-self.historyIndex-1);
      self.history.push(s);
      if ( self.history.length>self.historyLimit )
         self.history.shift();
      self.historyIndex=self.history.length-1;
      self.updateHistoryButtons();
   };

   this.rebuildBaselineFromHistory = function()
   {
      if ( self.sourceWorkingImage==null ) return;
      var src=self.sourceWorkingImage;
      var rebuilt=new Image(src);
      if ( self.basicStretchEnabled )
      {
         var W=src.width, H=src.height, C=src.numberOfChannels;
         for ( var y=0; y<H; ++y )
            for ( var x=0; x<W; ++x )
            {
               var lum;
               if ( C<3 )
                  lum=src.sample(x,y,0);
               else
                  lum=0.2126*src.sample(x,y,0)+
                      0.7152*src.sample(x,y,1)+
                      0.0722*src.sample(x,y,2);
               var d=Math.max(1.0e-8,1-self.basicStretchBlack);
               var normalized=Math.max(0,(lum-self.basicStretchBlack)/d);
               var newLum=basicStretchCurve(normalized,self.basicStretchGain,
                  self.basicStretchShoulder,self.basicStretchShoulderStrength);
               if ( C<3 )
                  rebuilt.setSample(newLum,x,y,0);
               else
               {
                  var scale=lum>1.0e-8 ? newLum/lum : 1;
                  for ( var c=0; c<Math.min(3,C); ++c )
                     rebuilt.setSample(Math.max(0,Math.min(1,
                        src.sample(x,y,c)*scale)),x,y,c);
               }
            }
      }
      if(self.basicStretchEnabled&&self.basicStretchFaintEnabled){var lifted=self.quickFaintPass(src);rebuilt.free();rebuilt=lifted;}
      if(self.basicStretchEnabled&&self.basicStretchLinearEnabled){var linear=self.quickLinearPass(rebuilt);rebuilt.free();rebuilt=linear;}
      if(self.basicStretchEnabled&&self.quickNebulosityEnabled){var nebula=self.quickNebulosityPass(rebuilt,self.quickNebulosityStrength,false,false);rebuilt.free();rebuilt=nebula;}
      if ( self.workingImage!=null ) self.workingImage.free();
      self.invalidatePreviewCaches();
      self.workingImage=rebuilt;
      if ( self.overlayImage!=null ) self.overlayImage.free();
      self.overlayImage=self.buildOverlayMap(self.workingImage);
      self.histogram.setHistogram(calculateHistogram(self.workingImage, 2048,self.channelMode));
      self.originalPreviewBitmap=self.makeFittedPreviewBitmap(self.workingImage);
   };

   this.restoreHistoryState = function( s )
   {
      self.historyRestoring=true;
      try
      {
         self.pendingSP=s.pendingSP!=null ? s.pendingSP : 0.5;
         self.committedSP=s.committedSP!=null ? s.committedSP : self.pendingSP;
         self.selectionMode=s.selectionMode;
         self.channelMode=s.channelMode || "RGBK";
         self.setChannelModeUI(self.channelMode,false);
         self.symmetryMode_Radio.checked=self.selectionMode=="symmetry";
         self.signalMode_Radio.checked=self.selectionMode=="signal";
         self.colorMode_Radio.checked=self.selectionMode=="color";
         self.lowContrastMode_Radio.checked=self.selectionMode=="lowcontrast";
         self.lowContrastSensitivity_Control.setValue(typeof s.lowContrastSensitivity=="number"?SmartTools.clamp(s.lowContrastSensitivity,0,100):50);
         self.lowContrastScale_Control.setValue(typeof s.lowContrastScale=="number"?SmartTools.clamp(s.lowContrastScale,.2,15):3);
         self.lowContrastCache=null;

         self.clickHalfWidth=s.clickHalfWidth;
         self.colorTolerance=s.colorTolerance;self.connectedColor_CheckBox.checked=s.connectedColor===true;self.faintColorReach_Control.setValue(typeof s.faintColorReach=="number"&&isFinite(s.faintColorReach)?Math.max(0,Math.min(1,s.faintColorReach)):.5);
         self.width_Control.setValue(s.clickHalfWidth);
         self.colorTolerance_Control.setValue(s.colorTolerance);

         self.basicStretchEnabled=s.basicStretchEnabled;
         self.autoHighContrastEnabled=s.autoHighContrastEnabled===true;
         self.autoColorBrightnessEnabled=s.autoColorBrightnessEnabled===true;
         self.autoBrightnessStrength=isFinite(s.autoBrightnessStrength)?Math.max(0,Math.min(1,s.autoBrightnessStrength)):.35;
         self.autoVibranceStrength=isFinite(s.autoVibranceStrength)?Math.max(0,Math.min(1,s.autoVibranceStrength)):.25;
         self.autoColorBrightness_Button.text=STHoverCaption(self.autoColorBrightness_Button,self.autoColorBrightnessEnabled?"Remove Color & Brightness":"Auto Color & Brightness",0);
         self.autoHighContrast_Button.text=STHoverCaption(self.autoHighContrast_Button,self.autoHighContrastEnabled?"Remove High Contrast":"Auto High Contrast",0);
         self.quickAnalysisRecipe=SSTOptional(s,"quickAnalysisRecipe",null);
         self.basicStretchFaintEnabled=s.basicStretchFaintEnabled===true;
         self.basicStretchFaintParameters=s.basicStretchFaintParameters==null?null:s.basicStretchFaintParameters.map(function(p){return {black:p.black,midtones:p.midtones};});
         self.basicStretchLinearEnabled=s.basicStretchLinearEnabled===true;
         self.quickNebulosityEnabled=s.quickNebulosityEnabled===true;
         self.quickNebulosityStrength=isFinite(s.quickNebulosityStrength)?Math.max(0,Math.min(1,s.quickNebulosityStrength)):.35;
         self.basicStretchGain=s.basicStretchGain;
         self.basicStretchBlack=s.basicStretchBlack;
         self.basicStretchShoulder=s.basicStretchShoulder;
         self.basicStretchShoulderStrength=s.basicStretchShoulderStrength;
         self.quickStretchClipFraction=s.quickStretchClipFraction;
         self.rebuildBaselineFromHistory();

         self.selections=[];
         for ( var i=0; i<s.selections.length; ++i )
            self.selections.push(self.copySelectionForHistory(s.selections[i]));
         self.samplePoints=[];
         for ( var p=0; p<s.samplePoints.length; ++p )
            self.samplePoints.push({x:s.samplePoints[p].x,y:s.samplePoints[p].y,
               center:s.samplePoints[p].center,spatial:!!s.samplePoints[p].spatial});
         self.rebuildSpatialSelections();
         self.maskEdits=[];
         if(s.maskEdits!=null)
            for(var me=0;me<s.maskEdits.length;++me)
            {
               var mp=[];
               for(var mq=0;mq<s.maskEdits[me].points.length;++mq)
                  mp.push({x:s.maskEdits[me].points[mq].x,y:s.maskEdits[me].points[mq].y});
               self.maskEdits.push({mode:s.maskEdits[me].mode,points:mp});
            }
         self.lassoActive=s.lassoActive===true;
         self.lassoMode=s.lassoMode=="keep" ? "keep" : "subtract";
         self.lassoEnable_CheckBox.checked=self.lassoActive;
         self.lassoSubtract_Radio.checked=self.lassoMode=="subtract";
         self.lassoKeep_Radio.checked=self.lassoMode=="keep";
         self.lassoDrawing=false;
         self.lassoPoints=[];

         self.overlayEnabled=s.overlayEnabled;
         self.overlay_CheckBox.checked=s.overlayEnabled;
         self.inverseSelection=s.inverseSelection===true;
         self.inverseSelection_CheckBox.checked=self.inverseSelection;
         self.overlayStrength=s.overlayStrength;
         self.overlayStrength_Control.setValue(s.overlayStrength);

         self.intensity_Control.setValue(s.intensity);
         self.contrast_Control.setValue(s.contrast);
         self.setStretchFocus(s.stretchFocus);
         self.stretch_Control.setValue(s.stretch);
         self.localIntensity_Control.setValue(
            s.localIntensity!=null ? s.localIntensity : 0.5);
         self.protectShadows_Control.setValue(
            s.protectShadows!=null ? s.protectShadows : 0.0);
         self.protectHighlights_Control.setValue(
            s.protectHighlights!=null ? s.protectHighlights : 0.0);
         self.adaptiveBoundary_Control.setValue(
            s.adaptiveBoundary!=null ? s.adaptiveBoundary : 0.65);
         self.hdrEnable_CheckBox.checked=s.hdrEnabled===true;
         self.hdrStrength_Control.setValue(
            s.hdrStrength!=null ? s.hdrStrength : 0.50);
         self.hdrScale_Control.setValue(
            s.hdrScale!=null ? s.hdrScale : 0.45);
         self.hdrStrength_Control.enabled=self.hdrEnable_CheckBox.checked;
         self.hdrScale_Control.enabled=self.hdrEnable_CheckBox.checked;
         self.before_CheckBox.checked=false;

         self.syncSelectionUI();
         self.updateProcessedPreview();
      }
      finally
      {
         self.historyRestoring=false;
      }
      self.updateHistoryButtons();
   };

   this.undoHistory = function()
   {
      if ( self.historyIndex<=0 ) return;
      --self.historyIndex;
      self.restoreHistoryState(self.history[self.historyIndex]);
      self.status_Label.text="Undo";
   };

   this.redoHistory = function()
   {
      if ( self.historyIndex<0 || self.historyIndex>=self.history.length-1 ) return;
      ++self.historyIndex;
      self.restoreHistoryState(self.history[self.historyIndex]);
      self.status_Label.text="Redo";
   };

   this.syncSelectionUI = function()
   {
      var lowContrastMode=self.selectionMode=="lowcontrast";
      if(lowContrastMode){self.selections=[];self.samplePoints=[];}
      self.lowContrastMode_Radio.checked=lowContrastMode;
      self.lowContrastSensitivity_Control.visible=lowContrastMode;
      self.lowContrastScale_Control.visible=lowContrastMode;
      self.connectedColor_CheckBox.enabled=self.selectionMode=="color";self.faintColorReach_Control.enabled=self.selectionMode=="color"&&self.connectedColor_CheckBox.checked;
      self.histogram.setSelectionMode(self.selectionMode);
      for ( var st=0; st<self.selections.length; ++st )
         if ( !self.selections[st].hasOwnProperty("type") )
            self.selections[st].type="signal";
      var spatialLock=self.hasSpatialSelections();
      var colorLock=self.selectionMode=="color";
      var symmetryLock=self.selectionMode=="symmetry";
      self.stretchFocus_Control.enabled=symmetryLock||self.selectionMode=="signal";
      var reason=colorLock ?
         (spatialLock ? "Color/Spatial selection active — histogram selection locked"
                      : "Color selection active — histogram selection locked")
         : (spatialLock ? "Spatial selection active — histogram selection locked" : "");
      // Symmetry Point intentionally keeps histogram clicking available.
      self.histogram.setSelectionLocked(lowContrastMode || colorLock || spatialLock,lowContrastMode?"Cyan bars show the mask-weighted share of pixels at each brightness; the cyan strip shows mask coverage even in faint tails. Histogram clicking and multi-select are disabled":reason);
      var multi = self.selections.length > 1;
      self.low_Control.enabled = !multi;
      self.high_Control.enabled = !multi;

      if ( self.selections.length == 1 )
      {
         self.suppressRangeUpdate = true;
         if ( self.selectionType(self.selections[0]) != "color" )
         {
            self.low_Control.setValue( self.selections[0].low );
            self.high_Control.setValue( self.selections[0].high );
         }
         self.suppressRangeUpdate = false;

         if ( self.selectionType(self.selections[0])=="symmetry" )
            self.range_Label.text =
               format("<b>Symmetry Point (SP):</b> %.4f",self.selections[0].center);
         else if ( self.selectionType(self.selections[0])=="color" )
         {
            var cs=self.selections[0];
            self.range_Label.text=cs.spatial ?
               format("<b>Spatial color:</b> R %.3f G %.3f B %.3f | tol %.3f | %d px",
                      cs.r,cs.g,cs.b,cs.tolerance,cs.spatialPixelCount || 0) :
               format("<b>Selected color:</b> R %.3f G %.3f B %.3f | tol %.3f",
                      cs.r,cs.g,cs.b,cs.tolerance);
         }
         else if ( self.selections[0].spatial )
            self.range_Label.text =
               format( "<b>Spatial range:</b> %.4f — %.4f | %d preview pixels",
                       self.selections[0].low, self.selections[0].high,
                       self.selections[0].spatialPixelCount || 0 );
         else
            self.range_Label.text =
               format( "<b>Selected range:</b> %.4f — %.4f",
                       self.selections[0].low, self.selections[0].high );
      }
      else if ( multi )
      {
         self.range_Label.text =
            "<b>Multi-range selection:</b> " +
            self.selections.length +
            " ranges — Low/High disabled; Click Range applies to all.";
      }
      else
         self.range_Label.text = "<b>No signal range selected</b>";

      self.histogram.setRanges( self.selections );
      self.updateSPDisplay();
      if(lowContrastMode){
         self.low_Control.enabled=false;self.high_Control.enabled=false;self.width_Control.enabled=false;self.colorTolerance_Control.enabled=false;
      }
      else if ( self.selectionMode=="color" )
      {
         self.low_Control.enabled=false;
         self.high_Control.enabled=false;
         self.width_Control.enabled=false;
         self.colorTolerance_Control.enabled=true;
      }
      else if(self.selectionMode=="symmetry")
      {
         self.low_Control.enabled=false;
         self.high_Control.enabled=false;
         self.width_Control.enabled=false;
         self.colorTolerance_Control.enabled=false;
      }
      else
      {
         self.width_Control.enabled=true;
         self.colorTolerance_Control.enabled=false;
         var oneSignal=self.selections.length==1 &&
            self.selectionType(self.selections[0])=="signal";
         self.low_Control.enabled=oneSignal;
         self.high_Control.enabled=oneSignal;
      }

      // Mask editing controls have no meaning in Symmetry Point mode.
      self.overlay_CheckBox.enabled=true;
      self.inverseSelection_CheckBox.enabled=!symmetryLock;
      self.overlayStrength_Control.enabled=true;
      self.lassoEnable_CheckBox.enabled=!symmetryLock;
      self.lassoSubtract_Radio.enabled=!symmetryLock;
      self.lassoKeep_Radio.enabled=!symmetryLock;
      self.lassoClear_Button.enabled=!symmetryLock;

      self.rebuildProcessingMask();
      if(lowContrastMode)self.range_Label.text="<b>Low Contrast:</b> one automatic mask; "+(self.lowContrastCache?(100*self.lowContrastCache.data.selectedFraction).toFixed(1):"0")+"% above 10% weight. Lasso refines; no multi-select.";
      if ( self.preview != null )
         self.preview.viewport.update();
   };

   this.selectionType = function( selection )
   {
      if ( selection == null || !selection.hasOwnProperty("type") )
         return "signal";
      return selection.type;
   };

   this.colorSelectionWeightAt = function( selection, x, y )
   {
      if ( self.workingImage == null || self.workingImage.numberOfChannels < 3 )
         return 0;
      return colorSimilarityWeight(
         self.workingImage.sample(x,y,0),
         self.workingImage.sample(x,y,1),
         self.workingImage.sample(x,y,2),
         selection.r,selection.g,selection.b,selection.tolerance );
   };

   this.buildColorSpatialComponent = function( selection )
   {
      if ( self.workingImage == null || self.workingImage.numberOfChannels < 3 )
         return false;
      var W=self.workingImage.width, H=self.workingImage.height;
      var sx=selection.seedX, sy=selection.seedY;
      if ( sx<0 || sy<0 || sx>=W || sy>=H ) return false;

      var visited=new Array(W*H), component=new Array(W*H);
      for ( var z=0; z<W*H; ++z ) visited[z]=false;
      var queue=new Array(W*H), head=0, tail=0;
      var seed=sy*W+sx;
      queue[tail++]=seed; visited[seed]=true;
      var count=0;

      while ( head<tail )
      {
         var p=queue[head++], py=Math.floor(p/W), px=p-py*W;
         component[p]=true; ++count;
         for ( var dy=-1; dy<=1; ++dy )
            for ( var dx=-1; dx<=1; ++dx )
            {
               if ( dx==0 && dy==0 ) continue;
               var nx=px+dx, ny=py+dy;
               if ( nx<0 || ny<0 || nx>=W || ny>=H ) continue;
               var ni=ny*W+nx;
               if ( visited[ni] ) continue;
               visited[ni]=true;
               if ( self.colorSelectionWeightAt(selection,nx,ny)>0 )
                  queue[tail++]=ni;
            }
      }

      if ( count<self.spatialMinimumPixels )
      {
         selection.spatialMask=null;
         selection.spatialPixelCount=count;
         return false;
      }
      selection.spatialMask=component;
      selection.spatialPixelCount=count;
      return true;
   };

   this.handleColorSelection = function( r,g,b,lum,ctrl,ix,iy,alt,wx,wy )
   {
      if(self.selectionMode=="lowcontrast")return;
      var candidate={
         type:"color", center:lum, r:r, g:g, b:b,
         tolerance:self.colorTolerance, spatial:!!alt,
         seedX:alt?wx:-1, seedY:alt?wy:-1,
         spatialMask:null, spatialPixelCount:0
      };

      if ( alt && !self.buildColorSpatialComponent(candidate) )
      {
         self.status_Label.text="Alt-click ignored: connected color region is too small.";
         return;
      }

      self.overlayEnabled=true;self.overlay_CheckBox.checked=true;
      if ( !ctrl )
      {
         self.maskEdits=[];
         self.selections=[candidate];
         self.samplePoints=[];
         if ( ix>=0 && iy>=0 )
            self.samplePoints.push({x:ix,y:iy,center:lum,spatial:!!alt});
      }
      else
      {
         var removeIndex=-1;
         for ( var i=0; i<self.selections.length; ++i )
         {
            var s=self.selections[i];
            if ( self.selectionType(s)!="color" || !!s.spatial!=!!alt )
               continue;
            if ( alt )
            {
               var dx=s.seedX-wx, dy=s.seedY-wy;
               if ( dx*dx+dy*dy<=100 ) { removeIndex=i; break; }
            }
            else
            {
               var ssum=s.r+s.g+s.b, csum=r+g+b;
               if ( ssum>1.0e-10 && csum>1.0e-10 )
               {
                  var sr=s.r/ssum, sg=s.g/ssum, sb=s.b/ssum;
                  var cr=r/csum, cg=g/csum, cb=b/csum;
                  var dr=sr-cr, dg=sg-cg, db=sb-cb;
                  var d=Math.sqrt(dr*dr+dg*dg+db*db);
                  var tt=s.tolerance;
                  if ( self.colorTolerance<tt ) tt=self.colorTolerance;
                  if ( d<=0.35*tt ) { removeIndex=i; break; }
               }
            }
         }
         if ( removeIndex>=0 )
         {
            var removed=self.selections[removeIndex];
            self.selections.splice(removeIndex,1);
            var bestPoint=-1, bestDistance=1.0e100;
            for ( var p=0; p<self.samplePoints.length; ++p )
            {
               if ( !!self.samplePoints[p].spatial!=!!removed.spatial ) continue;
               var dd=Math.abs(self.samplePoints[p].center-removed.center);
               if ( dd<bestDistance ) { bestDistance=dd; bestPoint=p; }
            }
            if ( bestPoint>=0 ) self.samplePoints.splice(bestPoint,1);
            self.syncSelectionUI();
            self.status_Label.text=alt ? "Spatial color selection removed." : "Color selection removed.";
            self.commitHistory();
            return;
         }
         self.selections.push(candidate);
         if ( ix>=0 && iy>=0 )
            self.samplePoints.push({x:ix,y:iy,center:lum,spatial:!!alt});
      }

      self.syncSelectionUI();
      if ( alt )
         self.status_Label.text=format("Spatial color: R %.3f G %.3f B %.3f | %d px",
                                       r,g,b,candidate.spatialPixelCount);
      else
         self.status_Label.text=format("Color: R %.3f G %.3f B %.3f",r,g,b);
      self.commitHistory();
   };

   this.handleSignalSelection = function( value, ctrl, ix, iy, alt, wx, wy )
   {
      if(self.selectionMode=="lowcontrast")return;
      value=Math.max(0,Math.min(1,value));
      alt=!!alt;

      var candidate={
         type:"signal",
         center:value,
         low:Math.max(0,value-self.clickHalfWidth),
         high:Math.min(1,value+self.clickHalfWidth),
         spatial:alt,
         seedX:alt ? wx : -1,
         seedY:alt ? wy : -1,
         spatialMask:null,
         spatialPixelCount:0
      };

      if ( alt && !self.buildSpatialComponent(candidate) )
      {
         self.status_Label.text =
            "Alt-click ignored: connected region is smaller than " +
            self.spatialMinimumPixels + " preview pixels.";
         return;
      }

      self.overlayEnabled=true;self.overlay_CheckBox.checked=true;
      if ( !ctrl )
      {
         self.maskEdits=[];
         self.selections=[candidate];
         self.samplePoints=[];
         if ( ix>=0 && iy>=0 )
            self.samplePoints.push({x:ix,y:iy,center:value,spatial:alt});
      }
      else
      {
         // Toggle the nearest selection of the same spatial/global type.
         // For spatial selections, a click near the same seed removes it.
         var removeIndex=-1;
         for ( var i=0; i<self.selections.length; ++i )
         {
            var s=self.selections[i];
            if ( self.selectionType(s)!="signal" || !!s.spatial != alt ) continue;
            if ( alt )
            {
               var dx=s.seedX-wx, dy=s.seedY-wy;
               if ( dx*dx+dy*dy <= 100 )
               { removeIndex=i; break; }
            }
            else if ( Math.abs(s.center-value)<=self.clickHalfWidth )
            { removeIndex=i; break; }
         }

         if ( removeIndex>=0 )
         {
            var removed=self.selections[removeIndex];
            self.selections.splice(removeIndex,1);
            for ( var p=self.samplePoints.length-1; p>=0; --p )
               if ( Math.abs(self.samplePoints[p].center-removed.center)<=1.0e-8 )
                  self.samplePoints.splice(p,1);
         }
         else
         {
            self.selections.push(candidate);
            if ( ix>=0 && iy>=0 )
               self.samplePoints.push({x:ix,y:iy,center:value,spatial:alt});
         }
      }

      self.syncSelectionUI();
      if ( alt )
         self.status_Label.text =
            "Spatial selection: connected region " +
            candidate.spatialPixelCount + " preview pixels.";
      self.commitHistory();
   };

   function updateSelection( changedLow )
   {
      if ( self.suppressRangeUpdate || self.selections.length != 1 )
         return;

      var lo = self.low_Control.value;
      var hi = self.high_Control.value;

      if ( lo > hi )
      {
         self.suppressRangeUpdate = true;
         if ( changedLow )
         {
            hi = lo;
            self.high_Control.setValue( hi );
         }
         else
         {
            lo = hi;
            self.low_Control.setValue( lo );
         }
         self.suppressRangeUpdate = false;
      }

      self.selections[0].low = lo;
      self.selections[0].high = hi;
      self.selections[0].center = 0.5*(lo+hi);
      if ( self.selections[0].spatial )
         self.buildSpatialComponent(self.selections[0]);
      self.syncSelectionUI();
      self.commitHistory();
   }

   this.low_Control.onValueUpdated = function()
   {
      updateSelection( true );
   };

   this.high_Control.onValueUpdated = function()
   {
      updateSelection( false );
   };

   this.signalValueAt=function(image,x,y)
   {
      if(image.numberOfChannels<3)return image.sample(x,y,0);
      if(self.channelMode=="R")return image.sample(x,y,0);
      if(self.channelMode=="G")return image.sample(x,y,1);
      if(self.channelMode=="B")return image.sample(x,y,2);
      return 0.2126*image.sample(x,y,0)+0.7152*image.sample(x,y,1)+0.0722*image.sample(x,y,2);
   };

   this.buildOverlayMap = function( workingImage )
   {
      var pw = workingImage.width;
      var ph = workingImage.height;
      var map = new Image( pw, ph, 1 );

      for ( var y = 0; y < ph; ++y )
         for ( var x = 0; x < pw; ++x )
         {
            var lum=self.signalValueAt(workingImage,x,y);
            map.setSample(Math.max(0,Math.min(1,lum)),x,y,0);
         }
      return map;
   };

   this.pointInPolygon = function( x, y, pts )
   {
      var inside=false;
      for(var i=0,j=pts.length-1;i<pts.length;j=i++)
      {
         var xi=pts[i].x, yi=pts[i].y, xj=pts[j].x, yj=pts[j].y;
         // Standard even/odd ray crossing test. The straddle condition
         // guarantees (yj-yi) is nonzero. Do NOT clamp this denominator:
         // preserving its sign is essential for downward polygon edges.
         var hit=((yi>y)!=(yj>y)) &&
            (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
         if(hit)inside=!inside;
      }
      return inside;
   };

   this.applyMaskEdits = function()
   {
      self.maskPlaneCache=null;self.rangePlaneCache=null;
      if(self.processingMask==null || self.maskEdits.length==0)return 0;
      var W=self.processingMask.width,H=self.processingMask.height;
      var changed=0;
      for(var e=0;e<self.maskEdits.length;++e)
      {
         var edit=self.maskEdits[e], pts=edit.points;
         if(pts==null || pts.length<3)continue;

         // Limit testing to the polygon bounding box for Subtract. Keep must
         // still visit the complete image because everything outside is erased.
         var minX=W-1,maxX=0,minY=H-1,maxY=0;
         for(var p=0;p<pts.length;++p)
         {
            minX=Math.min(minX,Math.floor(pts[p].x));
            maxX=Math.max(maxX,Math.ceil(pts[p].x));
            minY=Math.min(minY,Math.floor(pts[p].y));
            maxY=Math.max(maxY,Math.ceil(pts[p].y));
         }
         minX=Math.max(0,minX);maxX=Math.min(W-1,maxX);
         minY=Math.max(0,minY);maxY=Math.min(H-1,maxY);
         var yStart=edit.mode=="subtract"?minY:0;
         var yEnd=edit.mode=="subtract"?maxY:H-1;
         var xStart=edit.mode=="subtract"?minX:0;
         var xEnd=edit.mode=="subtract"?maxX:W-1;

         for(var y=yStart;y<=yEnd;++y)
            for(var x=xStart;x<=xEnd;++x)
            {
               var inside=self.pointInPolygon(x+0.5,y+0.5,pts);
               if((edit.mode=="subtract" && inside) ||
                  (edit.mode=="keep" && !inside))
               {
                  var oldValue=self.processingMask.sample(x,y,0);
                  if(oldValue>0){self.processingMask.setSample(0,x,y,0);++changed;}
               }
            }
      }
      return changed;
   };

   this.getLowContrastMask=function(){
      if(!self.workingImage)return null;
      var sensitivity=self.lowContrastSensitivity_Control.value,scale=self.lowContrastScale_Control.value;
      var cache=self.lowContrastCache;
      if(!cache||cache.source!==self.workingImage||cache.sensitivity!==sensitivity||cache.scale!==scale){
         cache={source:self.workingImage,sensitivity:sensitivity,scale:scale,data:STLCBuild(self.workingImage,sensitivity,scale)};
         self.lowContrastCache=cache;
      }return cache.data;
   };

   this.updateLowContrastHistogram=function(){
      if(self.histogram)self.histogram.setSelectionDensity(
         self.selectionMode=="lowcontrast"&&self.overlayImage&&self.processingMask ?
         STLCProject(self.overlayImage,self.processingMask,2048):null);
   };

   this.rebuildProcessingMask = function()
   {
      if(self.histogram)self.histogram.setSelectionDensity(null);
      self.maskPlaneCache=null;self.rangePlaneCache=null;
      if ( self.overlayImage == null )
         return;

      if ( self.processingMask != null )
      {
         self.processingMask.free();
         self.processingMask=null;
      }
      if ( self.processingRangeWidth != null )
      {
         self.processingRangeWidth.free();
         self.processingRangeWidth=null;
      }

      var W = self.overlayImage.width;
      var H = self.overlayImage.height;

      // AS remains global when no Smart Mask exists. When a Smart Mask has
      // been created, AS is explicitly constrained by that mask.
      if(self.selectionMode=="symmetry" && self.smartMask==null)
      {
         self.preview.viewport.update();
         return;
      }

      self.processingMask = new Image( W, H, 1 );
      self.processingRangeWidth = new Image( W, H, 1 );

      if(self.selectionMode=="symmetry" && self.smartMask!=null)
      {
         self.processingMask.assign(self.smartMask);
         for(var sy=0;sy<H;++sy)
            for(var sx=0;sx<W;++sx)
               self.processingRangeWidth.setSample(1.0,sx,sy,0);
         self.applyMaskEdits();
         if(self.inverseSelection)
            for(var siy=0;siy<H;++siy)
               for(var six=0;six<W;++six)
                  self.processingMask.setSample(
                     1.0-self.processingMask.sample(six,siy,0),six,siy,0);
         self.preview.viewport.update();
         return;
      }

      var lowContrast=self.selectionMode=="lowcontrast"?self.getLowContrastMask():null;
      var connected=null;
      if(self.selectionMode=="color"&&self.connectedColor_CheckBox.checked&&self.workingImage.numberOfChannels>=3){
         var regions=[];for(var ci=0;ci<self.selections.length;ci++){var cs=self.selections[ci];if(self.selectionType(cs)!="color")continue;var cq={type:"color",r:cs.r,g:cs.g,b:cs.b,tolerance:cs.tolerance};if(cs.spatial&&cs.spatialMask){cq.seedMask=cs.spatialMask;}regions.push(cq);}
         connected=SCCBuild(self.workingImage,regions,self.faintColorReach_Control.value);
      }

      for ( var y = 0; y < H; ++y )
         for ( var x = 0; x < W; ++x )
         {
            var v = self.overlayImage.sample( x, y, 0 );
            var best = lowContrast?lowContrast.weights[y*W+x]:0;
            var bestWidth = lowContrast?1:2*self.clickHalfWidth;

            // Find the winning selection once, when the mask changes.
            for ( var i = 0; i < self.selections.length; ++i )
            {
               var r = self.selections[i];
               var w = self.effectiveSelectionWeight( r, v, x, y );
               if ( w > best )
               {
                  best = w;
                  bestWidth = self.selectionType(r)=="color" ?
                     2*self.clickHalfWidth : Math.max(0,r.high-r.low);
               }
            }

            self.processingMask.setSample( Math.max(best,SCCSample(connected,x,y,W,H)), x, y, 0 );
            self.processingRangeWidth.setSample( bestWidth, x, y, 0 );
         }

      // A Smart Mask can also constrain Signal/Color selections.
      if(self.smartMask!=null)
         for(var smy=0;smy<H;++smy)
            for(var smx=0;smx<W;++smx)
               self.processingMask.setSample(
                  self.processingMask.sample(smx,smy,0)*
                  self.smartMask.sample(smx,smy,0),smx,smy,0);

      self.applyMaskEdits();

      // Inverse Selection operates on the final mask, including lasso edits.
      if(self.inverseSelection)
         for(var iy=0;iy<H;++iy)
            for(var ix=0;ix<W;++ix)
               self.processingMask.setSample(
                  1.0-self.processingMask.sample(ix,iy,0),ix,iy,0);
      self.updateLowContrastHistogram();
   };

   this.makeWorkingImage = function( sourceImage )
   {
      // Keep the displayed preview at the established fitted size, but process
      // a true half-width/half-height working image (about 2x2 binning).
      var maxW = 1280;
      var maxH = 760;
      var displayScale = Math.min( maxW/sourceImage.width,
                                   maxH/sourceImage.height );
      displayScale = Math.min( 1.0, displayScale );

      self.previewDisplayWidth =
         Math.max(1,Math.floor(sourceImage.width*displayScale));
      self.previewDisplayHeight =
         Math.max(1,Math.floor(sourceImage.height*displayScale));

      var pw=Math.max(1,Math.floor(self.previewDisplayWidth/2));
      var workingScale=pw/self.previewDisplayWidth;
      var ph=Math.max(1,Math.floor(self.previewDisplayHeight*workingScale));

      // These map original-image coordinates to WORKING-image coordinates.
      self.previewScaleX = pw/sourceImage.width;
      self.previewScaleY = ph/sourceImage.height;

      // These map DISPLAY coordinates to WORKING coordinates.
      self.displayToWorkingX = pw/self.previewDisplayWidth;
      self.displayToWorkingY = ph/self.previewDisplayHeight;
      self.workingToDisplayX = self.previewDisplayWidth/pw;
      self.workingToDisplayY = self.previewDisplayHeight/ph;

      var reduced = new Image( sourceImage );
      if ( pw != sourceImage.width || ph != sourceImage.height )
         reduced.resample( pw/sourceImage.width, ph/sourceImage.height );

      return reduced;
   };


   this.makeFittedPreviewBitmap = function( previewImage )
   {
      // The working image remains half width/half height for processing.
      // PixInsight 1.9.5 does not reliably support the Bitmap scaling path
      // used in the previous build, so enlarge a temporary Image with the
      // already-proven Image.resample() API, then render it 1:1.
      if(previewImage.width==self.previewDisplayWidth &&
         previewImage.height==self.previewDisplayHeight)
         return previewImage.render();

      var displayImage=new Image(previewImage);
      // Image.resample() uses one isotropic scale factor in this PJSR build.
      // Passing widthScale,heightScale was interpreted as scale + interpolation,
      // which produced the blank/gray display seen in testing.
      var displayScale=self.previewDisplayWidth/previewImage.width;
      displayImage.resample(displayScale);
      var b=displayImage.render();
      displayImage.free();
      // Use actual rendered dimensions for all display/working coordinate maps.
      self.previewDisplayWidth=b.width;
      self.previewDisplayHeight=b.height;
      self.displayToWorkingX=previewImage.width/b.width;
      self.displayToWorkingY=previewImage.height/b.height;
      self.workingToDisplayX=b.width/previewImage.width;
      self.workingToDisplayY=b.height/previewImage.height;
      return b;
   };


   this.analyzeBasicStretch = function()
   {
      if ( self.sourceWorkingImage == null )
         return null;

      var src = self.sourceWorkingImage;
      var lumImg = self.buildOverlayMap( src );
      var W = lumImg.width;
      var H = lumImg.height;
      var C = src.numberOfChannels;

      var lumValues = [];
      var samples = [];

      // Use up to about 120k representative pixels. Keep RGB values so the
      // search can detect channel clipping, not just luminance clipping.
      var step = Math.max( 1, Math.floor( Math.sqrt( (W*H)/120000 ) ) );
      for ( var y = 0; y < H; y += step )
         for ( var x = 0; x < W; x += step )
         {
            var lum = lumImg.sample( x, y, 0 );
            lumValues.push( lum );

            var r, g, b;
            if ( C < 3 )
               r = g = b = lum;
            else
            {
               r = src.sample( x, y, 0 );
               g = src.sample( x, y, 1 );
               b = src.sample( x, y, 2 );
            }
            samples.push( { lum:lum, r:r, g:g, b:b } );
         }

      if ( lumValues.length < 16 )
         return null;

      lumValues.sort( function( a, b ){ return a-b; } );

      var p05  = percentileFromSortedArray( lumValues, 0.05 );
      var p50  = percentileFromSortedArray( lumValues, 0.50 );
      var p90  = percentileFromSortedArray( lumValues, 0.90 );
      var p995 = percentileFromSortedArray( lumValues, 0.995 );

      // Conservative black point. This is intentionally less aggressive than
      // a conventional auto-screen stretch because Quick Stretch should not
      // throw away faint background structure.
      var black = Math.max( 0, p05 - 0.15*Math.max( 0, p50-p05 ) );
      black = Math.min( black, 0.75*p50 );

      // Highlight compression starts late. It protects the top end but does
      // not determine the strength of the faint/midtone stretch.
      var shoulder = Math.max( 0.72, Math.min( 0.90, p90 + 0.20 ) );
      var shoulderStrength = 0.88;
      if ( p995 > 0.70 ) shoulderStrength = 0.94;
      if ( p995 > 0.88 ) shoulderStrength = 0.98;

      // Test a proposed gain. "Near clipping" means >= 0.997 in any RGB
      // channel after luminance scaling. We tolerate only a tiny population
      // so isolated hot pixels / saturated star centers do not stop the search.
      function clippingFraction( gain )
      {
         var clipped = 0;
         var considered = 0;
         var threshold = 0.997;

         for ( var i = 0; i < samples.length; ++i )
         {
            var s = samples[i];
            var d = Math.max( 1.0e-8, 1-black );
            var n = Math.max( 0, (s.lum-black)/d );
            var newLum = basicStretchCurve(
               n, gain, shoulder, shoulderStrength );

            var scale = s.lum > 1.0e-8 ? newLum/s.lum : 1;
            var rr = s.r*scale;
            var gg = s.g*scale;
            var bb = s.b*scale;

            ++considered;
            if ( rr >= threshold || gg >= threshold || bb >= threshold )
               ++clipped;
         }

         return considered > 0 ? clipped/considered : 0;
      }

      // Allow 0.03% of representative pixels to approach clipping. This
      // intentionally ignores a very small set of hot pixels / saturated
      // stellar cores while reacting to meaningful highlight loss.
      var allowedClipFraction = 0.0003;

      // First expand upward until clipping becomes meaningful.
      var safeGain = 1.0;
      var unsafeGain = 2.0;
      var maxGain = 1000.0;

      while ( unsafeGain < maxGain &&
              clippingFraction( unsafeGain ) <= allowedClipFraction )
      {
         safeGain = unsafeGain;
         unsafeGain *= 1.6;
      }

      if ( unsafeGain > maxGain )
         unsafeGain = maxGain;

      // Binary-search the boundary between safe and meaningfully clipping.
      for ( var iter = 0; iter < 18; ++iter )
      {
         var testGain = 0.5*(safeGain+unsafeGain);
         if ( clippingFraction( testGain ) <= allowedClipFraction )
            safeGain = testGain;
         else
            unsafeGain = testGain;
      }

      // Back off 2.5% from the measured boundary for a small safety margin.
      var gain = Math.max( 1.0, safeGain*0.975 );
      var finalClip = clippingFraction( gain );

      lumImg.free();

      return {
         black: black,
         gain: gain,
         median: p50,
         p90: p90,
         high: p995,
         shoulder: shoulder,
         shoulderStrength: shoulderStrength,
         clipFraction: finalClip,
         clipLimit: allowedClipFraction
      };
   };


   this.analyzeQuickFaintParameters=function(src){var C=src.numberOfChannels,n=C<3?1:3,result=[];
      var step=Math.max(1,Math.ceil(Math.sqrt(src.width*src.height/60000)));
      for(var c=0;c<n;c++){var values=[];
         for(var y=0;y<src.height;y+=step)for(var x=0;x<src.width;x+=step){var v=src.sample(x,y,c);if(isFinite(v))values.push(Math.max(0,Math.min(1,v)));}
         values.sort(function(a,b){return a-b;});var median=percentileFromSortedArray(values,.5),deviations=[];
         for(var i=0;i<values.length;i++)deviations.push(Math.abs(values[i]-median));deviations.sort(function(a,b){return a-b;});
         var sigma=1.3257*percentileFromSortedArray(deviations,.5),black=0,m=.5;
         if(values.length>0&&values[values.length-1]-values[0]>1e-12&&median<.5){
            black=Math.max(0,Math.min(median-1e-12,median-2.8*sigma));
            var normalized=Math.max(1e-12,Math.min(1-1e-12,(median-black)/(1-black))),target=.25;
            m=Math.max(1e-8,Math.min(1-1e-8,(1-target)*normalized/(target+(1-2*target)*normalized)));
         }result.push({black:black,midtones:m});
         console.writeln("[Smart Stretch Quick] STF-style channel="+c+" | median="+median+" | robust sigma="+sigma+" | black="+black+" | midtones="+m+" | white=1 | samples="+values.length);
      }return result;
   };
   this.quickFaintValue=function(v,p){var x=Math.max(0,Math.min(1,(v-p.black)/Math.max(1e-12,1-p.black)));
      if(x<=0)return 0;if(x>=1)return 1;return (1-p.midtones)*x/(p.midtones+(1-2*p.midtones)*x);
   };
   this.quickFaintPass=function(src,parameters){
      if(!parameters&&self.quickAnalysisRecipe){var analysis=SSTProcess(src,self.quickAnalysisRecipe,function(f,stage){self.reportApplicationProgress(2+9*f,stage);});
         try{return self.quickFaintPass(analysis,self.basicStretchFaintParameters);}finally{analysis.free();}}
      var out=new Image(src),C=src.numberOfChannels,params=parameters||self.basicStretchFaintParameters;
      if(params==null||params.length!=(C<3?1:3)){out.free();throw new Error("Missing STF-style Quick parameters; select Quick Stretch again");}
      try{for(var y=0;y<src.height;y++)for(var x=0;x<src.width;x++)for(var c=0;c<(C<3?1:3);c++)
         out.setSample(self.quickFaintValue(src.sample(x,y,c),params[c]),x,y,c);
         return out;}catch(e){out.free();throw e;}
   };
   this.processNativeQuickFaint=function(src,borrowOutput){var pool=borrowOutput?self.nativeQuickFaintWorkspace:{},complete=false,t=SmartTools.now();
      var params=self.basicStretchFaintParameters,C=src.numberOfChannels;
      if(params==null||params.length!=(C<3?1:3))throw new Error("Missing STF-style Quick parameters");
      try{var w=SmartTools.acquireWindow(pool,"QuickSTF",src.width,src.height,C,src.bitsPerSample==64?64:32,C==3);
         SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);w.mainView.image.resetSelections();}finally{w.mainView.endProcess();}
         self.logApplyStage("Native Quick STF: source copy",t);t=SmartTools.now();
         var p=new HistogramTransformation;p.H=[[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1]];
         var rows=p.H;for(var c=0;c<params.length;c++)rows[C==1?3:c]=[params[c].black,params[c].midtones,1,0,1];p.H=rows;
         if(!p.executeOn(w.mainView,false))throw new Error("STF-style HistogramTransformation failed");
         self.logApplyStage("Native Quick STF: HistogramTransformation",t);t=SmartTools.now();var count=0,sum=0,maxError=0;
         for(var y=0;y<16;y++)for(var x=0;x<24;x++)for(var c=0;c<C;c++){
            var xx=Math.min(src.width-1,Math.floor((x+.5)*src.width/24)),yy=Math.min(src.height-1,Math.floor((y+.5)*src.height/16));
            var expected=self.quickFaintValue(src.sample(xx,yy,c),params[c]),actual=w.mainView.image.sample(xx,yy,c);
            if(!isFinite(actual))throw new Error("Nonfinite native STF-style result");var error=Math.abs(expected-actual);sum+=error;maxError=Math.max(maxError,error);count++;
         }console.writeln("[Smart Stretch Apply] Native Quick STF validation: samples="+count+" | mean error="+(sum/Math.max(1,count))+" | max error="+maxError);
         if(maxError>2e-7)throw new Error("Native STF-style numerical validation failed");self.logApplyStage("Native Quick STF: validation",t);
         var result=borrowOutput?w.mainView.image:new Image(w.mainView.image);complete=true;return result;
      }finally{if(!borrowOutput||!complete)SmartTools.closeWindowPool(pool);}
   };
   this.quickCandidate=function(a){var src=self.sourceWorkingImage,out=new Image(src),C=src.numberOfChannels;
      try{for(var y=0;y<src.height;y++)for(var x=0;x<src.width;x++){
         var v=C<3?src.sample(x,y,0):.2126*src.sample(x,y,0)+.7152*src.sample(x,y,1)+.0722*src.sample(x,y,2);
         var target=basicStretchCurve(Math.max(0,(v-a.black)/Math.max(1e-8,1-a.black)),a.gain,a.shoulder,a.shoulderStrength),ratio=v>1e-8?target/v:1;
         if(C<3)out.setSample(target,x,y,0);else for(var c=0;c<Math.min(3,C);c++)out.setSample(Math.max(0,Math.min(1,src.sample(x,y,c)*ratio)),x,y,c);
      }return out;}catch(e){out.free();throw e;}
   };
   // Linked affine endpoints: exact nominal-channel extrema, no percentile clipping.
   this.quickLinearLimits=function(src){var C=src.numberOfChannels,n=C<3?1:3,lo=Infinity,hi=-Infinity;
      try{src.resetSelections();for(var c=0;c<n;c++){src.selectedChannel=c;lo=Math.min(lo,src.minimum());hi=Math.max(hi,src.maximum());}}
      finally{src.resetSelections();}
      if(!isFinite(lo)||!isFinite(hi))throw new Error("Quick linear pass requires finite extrema");
      return {black:lo,white:hi,range:hi-lo};
   };
   this.quickLinearPass=function(src){var limits=self.quickLinearLimits(src),out=new Image(src),C=src.numberOfChannels;
      try{if(limits.range>1e-12)for(var y=0;y<src.height;y++)for(var x=0;x<src.width;x++)for(var c=0;c<(C<3?1:3);c++)
         out.setSample(Math.max(0,Math.min(1,(src.sample(x,y,c)-limits.black)/limits.range)),x,y,c);
         return out;}catch(e){out.free();throw e;}
   };
   this.processNativeQuickLinear=function(src,borrowOutput){var t=SmartTools.now(),limits=self.quickLinearLimits(src),pool=borrowOutput?self.nativeQuickFaintWorkspace:{},complete=false;
      try{var w=SmartTools.acquireWindow(pool,"QuickLinear",src.width,src.height,src.numberOfChannels,src.bitsPerSample==64?64:32,src.numberOfChannels==3);
         SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);w.mainView.image.resetSelections();}finally{w.mainView.endProcess();}
         self.logApplyStage("Native Quick linear: extrema / source copy",t);t=SmartTools.now();
         if(limits.range>1e-12){var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;
            p.expression="($T-("+limits.black+"))/("+limits.range+")";
            if(!p.executeOn(w.mainView,false))throw new Error("Quick linear native pass failed");}
         self.logApplyStage("Native Quick linear: linked black / white transform",t);t=SmartTools.now();
         var maxError=0,count=0;for(var y=0;y<16;y++)for(var x=0;x<24;x++)for(var c=0;c<src.numberOfChannels;c++){
            var xx=Math.min(src.width-1,Math.floor((x+.5)*src.width/24)),yy=Math.min(src.height-1,Math.floor((y+.5)*src.height/16));
            var original=src.sample(xx,yy,c),expected=limits.range>1e-12?Math.max(0,Math.min(1,(original-limits.black)/limits.range)):original;
            var actual=w.mainView.image.sample(xx,yy,c);if(!isFinite(actual))throw new Error("Nonfinite native Quick linear result");
            maxError=Math.max(maxError,Math.abs(actual-expected));count++;
         }if(maxError>2e-7)throw new Error("Quick linear validation failed");
         console.writeln("[Smart Stretch Apply] Quick linear black="+limits.black+" | white="+limits.white+" | samples="+count+" | max error="+maxError);
         self.logApplyStage("Native Quick linear: validation",t);var result=borrowOutput?w.mainView.image:new Image(w.mainView.image);complete=true;return result;
      }finally{if(!borrowOutput||!complete)SmartTools.closeWindowPool(pool);}
   };
   this.quickAggressiveParameters=function(base,value){if(value==50)return base.map(function(p){return {black:p.black,midtones:p.midtones};});var factor=Math.pow(16,(Math.max(0,Math.min(100,value))-50)/50);
      return base.map(function(p){var gain=(1-p.midtones)/Math.max(1e-12,p.midtones)*factor;
         return {black:p.black,midtones:Math.max(1e-8,Math.min(1-1e-8,1/(1+gain)))};});
   };
   // Optional true second pass: structure comes from the pristine reduced source.
   this.clearQuickNebulosityGuide=function(){
      if(self.quickNebulosityGuide){self.quickNebulosityGuide.free();self.quickNebulosityGuide=null;}
   };
   this.getQuickNebulosityGuide=function(){
      if(self.quickNebulosityGuide)return self.quickNebulosityGuide;
      if(!self.sourceWorkingImage)throw new Error("Faint Nebulosity needs the original working source");
      var proxy=new Image(self.sourceWorkingImage),mask=null;
      try{
         if(proxy.width>640||proxy.height>380)proxy.resample(Math.min(640/proxy.width,380/proxy.height));
         var detected=SmartMaskEngine.generate(proxy,{mode:"nebula",algorithm:"adaptive",sensitivity:.65,wisps:.70,suppressStars:true});
         mask=detected.mask;
         if(mask.width!=proxy.width||mask.height!=proxy.height)throw new Error("Faint Nebulosity guide geometry mismatch");
         self.quickNebulosityGuide=mask;mask=null;
         console.writeln("[Quick Nebulosity] Original-source guide: "+proxy.width+"x"+proxy.height+"; adaptive connected wisps; star suppression");
         return self.quickNebulosityGuide;
      }finally{if(mask)mask.free();proxy.free();}
   };
   this.quickNebulosityPixelGain=function(r,g,b,mask,strength){
      var y=.2126*r+.7152*g+.0722*b,bright=Math.max(r,g,b);
      if(strength<=0||mask<=0||y<=1e-8||bright>=.85)return 1;
      var weight=Math.max(0,Math.min(1,mask))*smoothStep01((y-.01)/.04)*
         (1-smoothStep01((y-.25)/.30))*(1-smoothStep01((bright-.55)/.30));
      var q=1+3*Math.max(0,Math.min(1,strength));
      var ratio=q/(1+(q-1)*y);
      return Math.max(1,Math.min(2,1/Math.max(1e-8,bright),1+weight*(ratio-1)));
   };
   this.quickNebulosityPass=function(src,strength,borrowOutput,forceJS){
      if(strength<=0)return borrowOutput?src:new Image(src);
      var map=self.getQuickNebulosityGuide(),C=src.numberOfChannels,W=src.width,H=src.height;
      if(C!=1&&C!=3)throw new Error("Faint Nebulosity supports grayscale or RGB images");
      var pool=borrowOutput?self.nativeQuickFaintWorkspace:{},out=null,nativeUsed=false,t=SmartTools.now();
      function gainAt(x,y){
         var r=src.sample(x,y,0),g=C==3?src.sample(x,y,1):r,b=C==3?src.sample(x,y,2):r;
         return self.quickNebulosityPixelGain(r,g,b,self.autoContrastMapGain(map,x,y,W,H),strength);
      }
      try{
         if(!forceJS&&W*H>1000000&&typeof PixelMath!="undefined")try{
            var work=SmartTools.acquireWindow(pool,"QuickNebulosity",W,H,C,src.bitsPerSample==64?64:32,C==3);
            var guide=SmartTools.acquireWindow(pool,"QuickNebulosityGuide",map.width,map.height,1,64,false);
            SmartTools.beginPrivateProcess(work.mainView);try{work.mainView.image.assign(src);work.mainView.image.resetSelections();}finally{work.mainView.endProcess();}
            SmartTools.beginPrivateProcess(guide.mainView);try{guide.mainView.image.assign(map);}finally{guide.mainView.endProcess();}
            var q=1+3*Math.max(0,Math.min(1,strength));
            var expression="nfX=min("+(map.width-1)+",max(0,(x()+0.5)*"+(map.width/W)+"-0.5));"+
               "nfY=min("+(map.height-1)+",max(0,(y()+0.5)*"+(map.height/H)+"-0.5));"+
               "nfI=floor(nfX);nfJ=floor(nfY);nfF=nfX-nfI;nfV=nfY-nfJ;"+
               "nfW=(1-nfV)*((1-nfF)*pixel("+guide.mainView.id+",nfI,nfJ)+nfF*pixel("+guide.mainView.id+",min(nfI+1,"+(map.width-1)+"),nfJ))+"+
               "nfV*((1-nfF)*pixel("+guide.mainView.id+",nfI,min(nfJ+1,"+(map.height-1)+"))+nfF*pixel("+guide.mainView.id+",min(nfI+1,"+(map.width-1)+"),min(nfJ+1,"+(map.height-1)+")));"+
               "nfL="+(C==3?"0.2126*$T[0]+0.7152*$T[1]+0.0722*$T[2]":"$T")+";"+
               "nfB="+(C==3?"max(max($T[0],$T[1]),$T[2])":"$T")+";"+
               "nfS=min(1,max(0,(nfL-0.01)/0.04));nfT=min(1,max(0,(nfL-0.25)/0.30));nfH=min(1,max(0,(nfB-0.55)/0.30));"+
               "nfW=min(1,max(0,nfW))*nfS*nfS*(3-2*nfS)*(1-nfT*nfT*(3-2*nfT))*(1-nfH*nfH*(3-2*nfH));"+
               "nfG=max(1,min(2,min(1/max(1e-8,nfB),1+nfW*("+q+"/(1+("+(q-1)+")*nfL)-1))));"+
               "$T*iif(nfL<=1e-8||nfB>=0.85,1,nfG)";
            var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;
            p.symbols="nfX,nfY,nfI,nfJ,nfF,nfV,nfW,nfL,nfB,nfS,nfT,nfH,nfG";p.expression=expression;
            if(!p.executeOn(work.mainView,false))throw new Error("Native Faint Nebulosity failed");
            var maxError=0;
            for(var yy=0;yy<16;yy++)for(var xx=0;xx<24;xx++){
               var x=Math.min(W-1,Math.floor((xx+.5)*W/24)),y=Math.min(H-1,Math.floor((yy+.5)*H/16)),gain=gainAt(x,y);
               for(var c=0;c<C;c++){var actual=work.mainView.image.sample(x,y,c);if(!isFinite(actual))throw new Error("Nonfinite Faint Nebulosity output");maxError=Math.max(maxError,Math.abs(actual-src.sample(x,y,c)*gain));}
            }
            if(maxError>2e-7)throw new Error("Faint Nebulosity native validation failed: "+maxError);
            out=borrowOutput?work.mainView.image:new Image(work.mainView.image);nativeUsed=true;
            console.writeln("[Quick Nebulosity] Native validation: "+(384*C)+" channel comparisons; max error="+maxError);
         }catch(e){console.warningln("[Quick Nebulosity] Native rejected; exact JavaScript fallback: "+e);}
         if(!out){out=new Image(src);
            for(var y=0;y<H;y++)for(var x=0;x<W;x++){
               var gain=gainAt(x,y);if(gain==1)continue;
               for(var c=0;c<C;c++)out.setSample(src.sample(x,y,c)*gain,x,y,c);
            }
            // A borrowed return must remain owned by its persistent window pool.
            if(borrowOutput){var js=SmartTools.acquireWindow(pool,"QuickNebulosityJS",W,H,C,src.bitsPerSample==64?64:32,C==3);
               SmartTools.beginPrivateProcess(js.mainView);try{js.mainView.image.assign(out);}finally{js.mainView.endProcess();}
               out.free();out=js.mainView.image;
            }
         }
         console.writeln("[Quick Nebulosity] "+(nativeUsed?"native":"JS")+"; strength="+strength+"; total="+SmartTools.elapsed(t));
         return out;
      }catch(e){if(out&&!borrowOutput)out.free();throw e;}
      finally{if(!borrowOutput)SmartTools.closeWindowPool(pool);}
   };

   // Final optional postprocessing. Existing Quick pass equations are unchanged.
   this.analyzeAutoColorBrightness=function(src,brightness,vibrance){
      var values=[],C=src.numberOfChannels,step=Math.max(1,Math.ceil(Math.sqrt(src.width*src.height/60000)));
      for(var y=0;y<src.height;y+=step)for(var x=0;x<src.width;x+=step){
         var v=C==1?src.sample(x,y,0):.2126*src.sample(x,y,0)+.7152*src.sample(x,y,1)+.0722*src.sample(x,y,2);
         if(isFinite(v))values.push(Math.max(0,Math.min(1,v)));
      }
      values.sort(function(a,b){return a-b;});
      var median=percentileFromSortedArray(values,.5),target=Math.max(median,Math.min(.45,median+.10)),gain=1;
      if(median>1e-8&&median<.45)gain=Math.max(1,Math.min(2.5,target*(1-median)/(median*Math.max(1e-8,1-target))));
      return {median:median,target:target,gain:gain,brightness:Math.max(0,Math.min(1,brightness)),vibrance:Math.max(0,Math.min(1,vibrance)),samples:values.length};
   };
   this.autoColorBrightnessPixel=function(r,g,b,p){
      var y=.2126*r+.7152*g+.0722*b,maximum=Math.max(r,g,b);
      if(y<=1e-8||maximum>=.90)return [r,g,b];
      var protection=smoothStep01((y-.01)/.04)*(1-smoothStep01((maximum-.65)/.25));
      var ratio=p.gain/(1+(p.gain-1)*y);
      var lift=Math.max(1,Math.min(1/Math.max(1e-8,maximum),1+p.brightness*protection*(ratio-1)));
      r*=lift;g*=lift;b*=lift;y*=lift;maximum*=lift;
      var minimum=Math.min(r,g,b),saturation=maximum>1e-8?(maximum-minimum)/maximum:0;
      var colorProtection=smoothStep01((y-.01)/.04)*(1-smoothStep01((maximum-.65)/.25));
      var factor=1+p.vibrance*colorProtection*(1-saturation)*(1-saturation),limit=Infinity;
      var channels=[r,g,b];
      for(var c=0;c<3;c++){var d=channels[c]-y;
         if(d>1e-12)limit=Math.min(limit,(1-y)/d);
         else if(d< -1e-12)limit=Math.min(limit,y/(-d));
      }
      factor=Math.max(1,Math.min(factor,limit));
      return [y+(r-y)*factor,y+(g-y)*factor,y+(b-y)*factor];
   };
   this.applyAutoColorBrightness=function(src,brightness,vibrance,forceJS){
      if(brightness<=0&&vibrance<=0)return src;
      var C=src.numberOfChannels,W=src.width,H=src.height;
      if(C!=1&&C!=3)throw new Error("Auto Color & Brightness supports grayscale or RGB images");
      var p0=self.analyzeAutoColorBrightness(src,brightness,vibrance),out=null,pool={},t=SmartTools.now(),nativeUsed=false;
      function expectedAt(x,y){var r=src.sample(x,y,0),g=C==3?src.sample(x,y,1):r,b=C==3?src.sample(x,y,2):r;return self.autoColorBrightnessPixel(r,g,b,p0);}
      try{
         if(!forceJS&&W*H>1000000&&typeof PixelMath!="undefined")try{
            var work=SmartTools.acquireWindow(pool,"AutoColorBrightness",W,H,C,src.bitsPerSample==64?64:32,C==3);
            SmartTools.beginPrivateProcess(work.mainView);try{work.mainView.image.assign(src);work.mainView.image.resetSelections();}finally{work.mainView.endProcess();}
            function num(v){return Number(v).toPrecision(17);}
            var common="vbR="+(C==3?"$T[0]":"$T")+";vbG="+(C==3?"$T[1]":"$T")+";vbB="+(C==3?"$T[2]":"$T")+";"+
               "vbY=0.2126*vbR+0.7152*vbG+0.0722*vbB;vbM=max(max(vbR,vbG),vbB);"+
               "vbS=min(1,max(0,(vbY-0.01)/0.04));vbH=min(1,max(0,(vbM-0.65)/0.25));"+
               "vbP=vbS*vbS*(3-2*vbS)*(1-vbH*vbH*(3-2*vbH));"+
               "vbL=iif(vbY<=1e-8||vbM>=0.90,1,max(1,min(1/max(1e-8,vbM),1+"+num(p0.brightness)+"*vbP*("+num(p0.gain)+"/(1+("+num(p0.gain-1)+")*vbY)-1))));"+
               "vbR=vbR*vbL;vbG=vbG*vbL;vbB=vbB*vbL;vbY=vbY*vbL;vbM=vbM*vbL;"+
               "vbS=min(1,max(0,(vbY-0.01)/0.04));vbH=min(1,max(0,(vbM-0.65)/0.25));"+
               "vbP=vbS*vbS*(3-2*vbS)*(1-vbH*vbH*(3-2*vbH));"+
               "vbA=(vbM-min(min(vbR,vbG),vbB))/max(1e-8,vbM);"+
               "vbF=iif(vbY<=1e-8||vbM>=0.90,1,1+"+num(p0.vibrance)+"*vbP*(1-vbA)*(1-vbA));";
            var names=["vbR","vbG","vbB"];
            for(var c=0;c<3;c++)common+="vbD="+names[c]+"-vbY;vbF=max(1,min(vbF,iif(vbD>1e-12,(1-vbY)/max(1e-12,vbD),iif(vbD< -1e-12,vbY/max(1e-12,-vbD),1e12))));";
            common+="vbR=vbY+(vbR-vbY)*vbF;vbG=vbY+(vbG-vbY)*vbF;vbB=vbY+(vbB-vbY)*vbF;";
            var p=SmartTools.configurePixelMath(new PixelMath,64);
            p.symbols="vbR,vbG,vbB,vbY,vbM,vbS,vbH,vbP,vbL,vbA,vbF,vbD";p.useSingleExpression=C==1;
            p.expression=common+"vbR";if(C==3){p.expression1=common+"vbG";p.expression2=common+"vbB";}
            if(!p.executeOn(work.mainView,false))throw new Error("Native Auto Color & Brightness failed");
            var maxError=0;
            for(var yy=0;yy<16;yy++)for(var xx=0;xx<24;xx++){
               var x=Math.min(W-1,Math.floor((xx+.5)*W/24)),y=Math.min(H-1,Math.floor((yy+.5)*H/16)),expected=expectedAt(x,y);
               for(var c=0;c<C;c++){var actual=work.mainView.image.sample(x,y,c);if(!isFinite(actual))throw new Error("Nonfinite Auto Color & Brightness output");maxError=Math.max(maxError,Math.abs(actual-expected[c]));}
            }
            if(maxError>2e-7)throw new Error("Auto Color & Brightness native validation failed: "+maxError);
            out=new Image(work.mainView.image);nativeUsed=true;
            console.writeln("[Auto Color & Brightness] Native validation: "+(384*C)+" comparisons; max error="+maxError);
         }catch(e){console.warningln("[Auto Color & Brightness] Native rejected; exact JavaScript fallback: "+e);}
         if(!out){out=new Image(src);for(var y=0;y<H;y++)for(var x=0;x<W;x++){
            var pixel=expectedAt(x,y);for(var c=0;c<C;c++)out.setSample(pixel[c],x,y,c);
         }}
         console.writeln("[Auto Color & Brightness] "+(nativeUsed?"native":"JS")+"; median="+p0.median+"; target="+p0.target+"; gain="+p0.gain+"; brightness="+p0.brightness+"; vibrance="+p0.vibrance+"; total="+SmartTools.elapsed(t));
         return out;
      }catch(e){if(out)out.free();throw e;}finally{SmartTools.closeWindowPool(pool);}
   };
   this.replaceApplyResultWithAutoColor=function(src,owned){
      var adjusted=self.applyAutoColorBrightness(src,self.autoBrightnessStrength,self.autoVibranceStrength,false);
      if(adjusted===src)return {image:src,owned:owned};
      if(owned)src.free();return {image:adjusted,owned:true};
   };

   this.analyzeQuickStartingRecipe=function(palette,parent){
      var proxy=new Image(self.sourceWorkingImage),busy=new SmartStretchBusyDialog(parent||self),cancelled=false;
      var oldEnabled=self.enabled;
      busy.windowTitle="Quick Stretch — Image Analysis";
      busy.message_Label.text="<b>Building Image Analysis preview…</b>";
      busy.onClose=function(){cancelled=true;return true;};
      var cancel=STHoverAttach(new PushButton(busy),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){cancelled=true;};busy._stBody.add(cancel);
      function progress(done,total){if(cancelled)throw new Error("Quick Stretch analysis cancelled");busy.setProgress(100*done/total,"Evaluating stretch "+done+" of "+total);processEvents();if(cancelled)throw new Error("Quick Stretch analysis cancelled");}
      function rankGrid(session,reference,offset){
         SSTPrepareGrid(session,proxy);var grid=SSTGrid(session),best=null,bestQuality=null;
         for(var i=0;i<grid.length;i++){progress(offset+i,108);var image=null;
            try{image=SSTProcess(proxy,grid[i]);var q=SSTQuality(image,reference);
               if(!isFinite(q.score))throw new Error("Invalid Image Analysis score");
               if(!best||(!q.warning&&bestQuality.warning)|| (!!q.warning==!!bestQuality.warning&&q.score>bestQuality.score)){best=SSTCopy(grid[i]);bestQuality=q;}
            }finally{if(image)image.free();}}
         return {recipe:best,quality:bestQuality};
      }
      try{self.enabled=false;STScreenFit.show(busy);processEvents();
         var scale=Math.min(1,360/proxy.width,240/proxy.height);if(scale<1)proxy.resample(scale);
         var stats=SSTMeasure(proxy),reference=SSTQualitySource(proxy);reference.palette=palette;
         var target=reference.structure.type=="galaxy"?"Galaxy":reference.structure.type=="starField"?"Open cluster / star field":reference.structure.type=="cluster"?"Globular cluster":"Mixed bright / faint nebula";
         var candidates=SSTCandidates(stats,20261012,proxy,target,null,palette),best=null;
         for(var group=0;group<9;group++){
            var session={flow:2,stage:"round",round:group,candidates:candidates};
            var result=rankGrid(session,reference,group*9);
            if(!best||(!result.quality.warning&&best.quality.warning)|| (!!result.quality.warning==!!best.quality.warning&&result.quality.score>best.quality.score))best=result;
         }
         for(var step=0;step<3;step++){
            var refine={flow:2,stage:"refine",refineAlgorithm:5,refineWidths:{},branch:0,refineStep:step,seed:20261012,stats:stats};
            refine.refineGrid=SSTRefineGrid(refine,best.recipe);best=rankGrid(refine,reference,81+9*step);
         }
         progress(108,108);console.writeln("[Quick Stretch Image Analysis] "+SSTDetectedStructure(reference)+" | method="+SST_FAMILIES[best.recipe.family]+" | score="+best.quality.score.toFixed(2)+" | warning="+(best.quality.warning||"none"));
         return {recipe:best.recipe,quality:best.quality,description:SSTDetectedStructure(reference)};
      }catch(e){if(cancelled)return null;throw e;}
      finally{busy.hide();self.enabled=oldEnabled;SSTSourceCacheImage=null;SSTSourceCacheValue=null;proxy.free();}
   };
   this.chooseQuickStartingVersion=function(){
      var d=new Dialog,bitmaps=[null,null],selected=-1,recipe=null,result=null;
      d.windowTitle="Quick Stretch — Choose starting version";
      var stf=null,linear=null,enhanced=null,nebulaImage=null,colorImage=null;
      try{
         var params=self.analyzeQuickFaintParameters(self.sourceWorkingImage);
         stf=self.quickFaintPass(self.sourceWorkingImage,params);linear=self.quickLinearPass(stf);
         if(self.quickNebulosityEnabled)nebulaImage=self.quickNebulosityPass(linear,self.quickNebulosityStrength,false,false);
         enhanced=self.applyAutoHighContrast(nebulaImage||linear,true);
         if(self.autoColorBrightnessEnabled)colorImage=self.applyAutoColorBrightness(enhanced,self.autoBrightnessStrength,self.autoVibranceStrength,false);
         bitmaps[0]=(colorImage||enhanced).render();
      }finally{if(colorImage&&colorImage!==enhanced)colorImage.free();if(enhanced&&enhanced!==(nebulaImage||linear))enhanced.free();if(nebulaImage)nebulaImage.free();if(linear)linear.free();if(stf)stf.free();}
      var row=new HorizontalSizer;row.spacing=12;var buttons=[],canvases=[];
      function select(i){selected=i;open.enabled=i==0||recipe!=null;for(var b=0;b<buttons.length;b++){buttons[b].text=(selected==b?"Selected: ":"Select ")+(b==0?"STF-Style":"Image Analysis");canvases[b].update();}}
      function addCard(i,title){
         var column=new VerticalSizer;column.spacing=6;
         var label=new Label(d);label.text=title;column.add(label);
         var canvas=new Control(d);var tileSize=STScreenFit.tileSize(d,560,340,2,1,300);canvas.setFixedSize(tileSize.width,tileSize.height);
         canvas.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(selected==i?0xff245580:0xff151515));var bitmap=bitmaps[i];if(bitmap){var scale=Math.min((this.width-8)/bitmap.width,(this.height-8)/bitmap.height);var ox=(this.width-scale*bitmap.width)/2,oy=(this.height-scale*bitmap.height)/2;g.scaleTransformation(scale);g.drawBitmap(Math.round(ox/scale),Math.round(oy/scale),bitmap);}}finally{g.end();}};
         canvas.onMousePress=function(){if(i==0||recipe)select(i);};column.add(canvas);canvases.push(canvas);
         var button=STHoverAttach(new PushButton(d),"Select this preview candidate for closer inspection or the next step.");button.text=STHoverCaption(button,"Select "+title,0);button.onClick=function(){if(i==0||recipe)select(i);};column.add(button);buttons.push(button);row.add(column);
      }
      addCard(0,"STF-Style");addCard(1,"Image Analysis");
      var notes=new Label(d);notes.wordWrapping=true;notes.text="Choose a starting image, then open it in QuickStretch for adjustments. Full-resolution Apply remains manual.";
      var palette=STHoverAttach(new ComboBox(d),"Choose the image channel mapping so analysis and stretch candidates can account for RGB, HOO, SHO or other palettes.");for(var pi=0;pi<SST_PALETTES.length;pi++)palette.addItem(SST_PALETTES[pi]);palette.currentItem=0;
      palette.toolTip="Select the image's color palette before reanalyzing. Mono uses the same luminance analysis.";
      var reanalyze=new PushButton(d);reanalyze.text=STHoverCaption(reanalyze,"Reanalyze palette",0);
      function analyze(){
         var found=self.analyzeQuickStartingRecipe(SST_PALETTES[palette.currentItem],d);if(!found)return false;
         var image=null;try{image=SSTProcess(self.sourceWorkingImage,found.recipe);var bitmap=image.render();recipe=found.recipe;bitmaps[1]=bitmap;}finally{if(image)image.free();}
         notes.text=found.description+(found.quality.warning?". Review: "+found.quality.warning:".")+" Choose either preview to open in QuickStretch.";canvases[1].update();if(selected==1)select(1);return true;
      }
      reanalyze.onClick=function(){try{if(!analyze())notes.text="Reanalysis cancelled; the previous preview is retained.";}catch(e){new MessageBox(String(e),"Quick Stretch",StdIcon_Error,StdButton_Ok).execute();}};
      var paletteRow=new HorizontalSizer;paletteRow.spacing=8;var paletteLabel=new Label(d);paletteLabel.text="Image Analysis palette:";paletteRow.add(paletteLabel);paletteRow.add(palette);paletteRow.add(reanalyze);paletteRow.addStretch();
      var open=STHoverAttach(new PushButton(d),"Continue with the selected starting image and recipe.");open.text=STHoverCaption(open,"Open in QuickStretch",0);open.enabled=false;open.onClick=function(){if(selected<0)return;result={recipe:selected==1?SSTCopy(recipe):null};d.ok();};
      var cancel=STHoverAttach(new PushButton(d),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){d.cancel();};var action=new HorizontalSizer;action.spacing=8;action.addStretch();action.add(open);action.add(cancel);
      d._stBody=new VerticalSizer;d._stBody.margin=12;d._stBody.spacing=10;d._stBody.add(row);d._stBody.add(paletteRow);d._stBody.add(notes);d._stBody.add(action);d._stFooter=action;
      try{if(!analyze())return null;STScreenFit.adjust(d);STScreenFit.execute(d);return result;}
      catch(e){new MessageBox(String(e),"Quick Stretch comparison",StdIcon_Error,StdButton_Ok).execute();return null;}
      finally{bitmaps[0]=null;bitmaps[1]=null;}
   };

   this.chooseQuickStretch=function(a){var chosen=-1,bitmap=null,parameters=null,busy=false,closed=false,lastKey="",pool={},nativeUses=0;
      var nativeAvailable=typeof HistogramTransformation!="undefined"&&typeof PixelMath!="undefined";
      var timer=new Timer;timer.interval=.12;timer.periodic=false;
      var selectedStart=self.trainerWinnerMode?{recipe:null}:self.chooseQuickStartingVersion();
      if(!selectedStart)return -1;
      var analysisBase=null;
      try{if(selectedStart.recipe)analysisBase=SSTProcess(self.sourceWorkingImage,selectedStart.recipe);}
      catch(e){new MessageBox(String(e),"Quick Stretch",StdIcon_Error,StdButton_Ok).execute();return -1;}
      var src=analysisBase||self.sourceWorkingImage,base=self.analyzeQuickFaintParameters(src),d=new Dialog;
      if(analysisBase)for(var ab=0;ab<base.length;ab++)base[ab]={black:0,midtones:.5};
      if(self.trainerWinnerMode)for(var bc=0;bc<base.length;bc++)base[bc]={black:0,midtones:.5};d.windowTitle="Quick Stretch — "+(analysisBase?"Image Analysis":"STF-Style");
      // Channel extrema are invariant under the monotonic STF curve: scan once.
      var extrema=[],C=src.numberOfChannels;
      try{src.resetSelections();for(var c=0;c<(C<3?1:3);c++){src.selectedChannel=c;extrema.push({min:src.minimum(),max:src.maximum()});}}
      finally{src.resetSelections();}
      var panel=new Control(d);STScreenFit.preview(panel,SmartTools.previewWidth,SmartTools.previewHeight,48,460,true);
      panel.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff000000));
         if(bitmap){var scale=Math.min(this.width/bitmap.width,this.height/bitmap.height);
            var x=Math.floor((this.width-scale*bitmap.width)/2),y=Math.floor((this.height-scale*bitmap.height)/2);
            g.scaleTransformation(scale);g.drawBitmap(Math.round(x/scale),Math.round(y/scale),bitmap);}
         }finally{g.end();}};
      var linear=new CheckBox(d);linear.text=STHoverCaption(linear,"Linear black / white",0);linear.checked=!self.trainerWinnerMode&&!analysisBase;
      linear.toolTip="Stretch the current preview's minimum to black and maximum to white. Full Apply recalculates full-resolution extrema.";
      var highContrast=new CheckBox(d);highContrast.text=STHoverCaption(highContrast,"Auto High Contrast",0);highContrast.checked=!self.trainerWinnerMode&&!analysisBase;
      highContrast.toolTip="Enhance eligible low-contrast structure in the preview and selected Quick Stretch workflow.";
      var nebula=new CheckBox(d);nebula.text=STHoverCaption(nebula,"Faint Nebulosity (experimental second pass)",0);nebula.checked=analysisBase?false:self.quickNebulosityEnabled;
      nebula.toolTip="Lift connected faint structure using the original reduced image; protects dark background, stars and highlights. Off by default.";
      var nebulaStrength=new NumericControl(d);nebulaStrength.label.text=STHoverCaption(nebulaStrength,"Faint Nebulosity Strength",2);
      nebulaStrength.setRange(0,1);nebulaStrength.slider.setRange(0,1000);nebulaStrength.setPrecision(2);
      nebulaStrength.setValue(self.quickNebulosityStrength);nebulaStrength.enabled=nebula.checked;
      SmartTools.configureNumericInput(nebulaStrength);
      var colorEnhance=new CheckBox(d);colorEnhance.text=STHoverCaption(colorEnhance,"Auto Color & Brightness (experimental)",0);
      colorEnhance.checked=analysisBase?false:self.autoColorBrightnessEnabled;
      colorEnhance.toolTip="Final protected midtone lift and luminance-preserving vibrance. Off by default; existing Quick passes are unchanged.";
      var brightnessStrength=new NumericControl(d);brightnessStrength.label.text=STHoverCaption(brightnessStrength,"Brightness Strength",2);
      brightnessStrength.setRange(0,1);brightnessStrength.slider.setRange(0,1000);brightnessStrength.setPrecision(2);brightnessStrength.setValue(self.autoBrightnessStrength);
      var vibranceStrength=new NumericControl(d);vibranceStrength.label.text=STHoverCaption(vibranceStrength,"Vibrance Strength",2);
      vibranceStrength.setRange(0,1);vibranceStrength.slider.setRange(0,1000);vibranceStrength.setPrecision(2);vibranceStrength.setValue(self.autoVibranceStrength);
      brightnessStrength.enabled=vibranceStrength.enabled=colorEnhance.checked;
      SmartTools.configureNumericInput(brightnessStrength);SmartTools.configureNumericInput(vibranceStrength);
      var colorRow=new HorizontalSizer;colorRow.spacing=10;colorRow.add(brightnessStrength,1);colorRow.add(vibranceStrength,1);
      var slider=STHoverAttach(new Slider(d),"Stretch aggressiveness: move left for a gentler starting stretch and right for a stronger one.");slider.setRange(0,100);slider.value=50;slider.tracking=true;
      slider.setFixedWidth(panel.width);slider.toolTip="Left: gentler stretch. Center: current STF-style stretch. Right: stronger stretch. Black points stay fixed.";
      slider.styleSheet="QSlider::handle:horizontal { image: none; border-image: none; width: 0.55em; margin: -0.45em 0; border: 1px solid palette(dark); border-radius: 2px; background: palette(button); }";
      var label=new Label(d);label.text="Stretch Aggressiveness: 50";
      function refresh(){timer.stop();if(busy||closed)return;var key=slider.value+":"+linear.checked+":"+nebula.checked+":"+nebulaStrength.value+":"+highContrast.checked+":"+colorEnhance.checked+":"+brightnessStrength.value+":"+vibranceStrength.value;if(key==lastKey)return;
         busy=true;var image=null,borrowed=false,start=SmartTools.now(),t=start,stretchTime=0,linearTime=0,renderTime=0;
         try{parameters=self.quickAggressiveParameters(base,slider.value);
            var lo=Infinity,hi=-Infinity;for(var c=0;c<extrema.length;c++){
               lo=Math.min(lo,self.quickFaintValue(extrema[c].min,parameters[c]));hi=Math.max(hi,self.quickFaintValue(extrema[c].max,parameters[c]));
            }var range=hi-lo;
            if(nativeAvailable&&(C==1||C==3))try{
               if(nativeUses>=16){SmartTools.closeWindowPool(pool);nativeUses=0;}nativeUses++;
               var w=SmartTools.acquireWindow(pool,"QuickChooser",src.width,src.height,C,64,C==3);
               SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);w.mainView.image.resetSelections();}finally{w.mainView.endProcess();}
               var h=new HistogramTransformation,rows=[[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1]];
               for(var c=0;c<parameters.length;c++)rows[C==1?3:c]=[parameters[c].black,parameters[c].midtones,1,0,1];h.H=rows;
               if(!h.executeOn(w.mainView,false))throw new Error("Chooser native STF failed");
               stretchTime=SmartTools.now()-t;t=SmartTools.now();
               if(linear.checked&&range>1e-12){var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;p.expression="($T-("+lo+"))/("+range+")";
                  if(!p.executeOn(w.mainView,false))throw new Error("Chooser native linear pass failed");}
               linearTime=SmartTools.now()-t;t=SmartTools.now();
               // Validate the displayed transform without another image scan.
               for(var yy=0;yy<6;yy++)for(var xx=0;xx<8;xx++)for(var c=0;c<C;c++){
                  var x=Math.min(src.width-1,Math.floor((xx+.5)*src.width/8)),y=Math.min(src.height-1,Math.floor((yy+.5)*src.height/6));
                  var expected=self.quickFaintValue(src.sample(x,y,c),parameters[c]);if(linear.checked&&range>1e-12)expected=Math.max(0,Math.min(1,(expected-lo)/range));
                  var actual=w.mainView.image.sample(x,y,c);if(!isFinite(actual)||Math.abs(actual-expected)>2e-7)throw new Error("Chooser native reference validation failed");
               }image=w.mainView.image;borrowed=true;
            }catch(e){nativeAvailable=false;console.warningln("[Quick Stretch Preview] Native fallback: "+e);}
            if(image==null){image=self.quickFaintPass(src,parameters);stretchTime=SmartTools.now()-t;t=SmartTools.now();
               if(linear.checked){var adjusted=self.quickLinearPass(image);image.free();image=adjusted;}
               linearTime=SmartTools.now()-t;t=SmartTools.now();}
            if(nebula.checked){var faintResult=self.quickNebulosityPass(image,nebulaStrength.value,false,false);if(!borrowed)image.free();image=faintResult;borrowed=false;}
            if(highContrast.checked){var enhanced=self.applyAutoHighContrast(image,true);if(!borrowed)image.free();image=enhanced;borrowed=false;}
            if(colorEnhance.checked){var colorResult=self.applyAutoColorBrightness(image,brightnessStrength.value,vibranceStrength.value,false);if(colorResult!==image){if(!borrowed)image.free();image=colorResult;borrowed=false;}}
            bitmap=image.render();renderTime=SmartTools.now()-t;label.text="Stretch Aggressiveness: "+slider.value;lastKey=key;panel.update();
            console.writeln("[Quick Stretch Preview] "+(borrowed?"native":"JS")+" | stretch="+(stretchTime/1000).toFixed(3)+" s | linear="+(linearTime/1000).toFixed(3)+" s | validation/render="+(renderTime/1000).toFixed(3)+" s | total="+((SmartTools.now()-start)/1000).toFixed(3)+" s");
         }finally{if(image&&!borrowed)image.free();busy=false;}
      }
      timer.onTimeout=function(){refresh();};
      slider.onValueUpdated=function(){label.text="Stretch Aggressiveness: "+slider.value;timer.stop();if(!closed)timer.start();};
      linear.onCheck=highContrast.onCheck=function(){refresh();};
      nebula.onCheck=function(){nebulaStrength.enabled=nebula.checked;refresh();};
      nebulaStrength.onValueUpdated=function(){timer.stop();if(!closed)timer.start();};
      colorEnhance.onCheck=function(){brightnessStrength.enabled=vibranceStrength.enabled=colorEnhance.checked;refresh();};
      brightnessStrength.onValueUpdated=vibranceStrength.onValueUpdated=function(){timer.stop();if(!closed)timer.start();};
      var stretchColumn=new VerticalSizer;stretchColumn.spacing=4;stretchColumn.add(label);stretchColumn.add(slider);
      var controls=new VerticalSizer;controls.spacing=6;controls.add(stretchColumn);controls.add(linear);controls.add(nebula);controls.add(nebulaStrength);controls.add(highContrast);controls.add(colorEnhance);controls.add(colorRow);
      var ok=new PushButton(d);ok.text=STHoverCaption(ok,"OK",0);ok.onClick=function(){refresh();chosen=linear.checked?3:1;d.ok();};
      var reset=new PushButton(d);reset.text=STHoverCaption(reset,"Reset",0);reset.toolTip="Restore aggressiveness 50, linear black / white and Auto High Contrast enabled, Faint Nebulosity disabled (0.35); Auto Color & Brightness disabled (brightness 0.35, vibrance 0.25).";
      reset.onClick=function(){timer.stop();slider.value=50;linear.checked=!self.trainerWinnerMode&&!analysisBase;highContrast.checked=!self.trainerWinnerMode&&!analysisBase;nebula.checked=false;nebulaStrength.setValue(.35);nebulaStrength.enabled=false;colorEnhance.checked=false;brightnessStrength.setValue(.35);vibranceStrength.setValue(.25);brightnessStrength.enabled=vibranceStrength.enabled=false;refresh();};
      var cancel=STHoverAttach(new PushButton(d),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){timer.stop();d.cancel();};
      var buttons=new HorizontalSizer;buttons.spacing=6;buttons.add(reset);buttons.addStretch();buttons.add(ok);buttons.add(cancel);
      var info=new Label(d);info.text=analysisBase?"Image Analysis recipe with adjustable strength. OK selects this Quick Stretch; full-image Apply remains manual.":"STF-style RGB curves can clip shadows and change color balance. OK selects this Quick Stretch; full-image Apply remains manual.";info.wordWrapping=true;
      d._stBody=new VerticalSizer;d._stBody.margin=10;d._stBody.spacing=8;d._stBody.add(panel);d._stBody.add(controls);d._stBody.add(info);d._stBody.add(buttons);d._stFooter=buttons;
      try{refresh();STScreenFit.adjust(d);STScreenFit.execute(d);if(chosen>=0){self.quickAnalysisRecipe=selectedStart.recipe?SSTCopy(selectedStart.recipe):null;self.basicStretchFaintParameters=parameters;self.quickNebulosityEnabled=nebula.checked;self.quickNebulosityStrength=nebulaStrength.value;self.autoColorBrightnessEnabled=colorEnhance.checked;self.autoBrightnessStrength=brightnessStrength.value;self.autoVibranceStrength=vibranceStrength.value;self.autoColorBrightness_Button.text=STHoverCaption(self.autoColorBrightness_Button,colorEnhance.checked?"Remove Color & Brightness":"Auto Color & Brightness",0);self.autoHighContrastEnabled=highContrast.checked;self.autoHighContrast_Button.text=STHoverCaption(self.autoHighContrast_Button,highContrast.checked?"Remove High Contrast":"Auto High Contrast",0);}return chosen;}
      finally{closed=true;timer.stop();bitmap=null;if(analysisBase)analysisBase.free();var closeStart=SmartTools.now();SmartTools.closeWindowPool(pool);console.writeln("[Quick Stretch Preview] Close cleanup="+((SmartTools.now()-closeStart)/1000).toFixed(3)+" s");}
   };
   this.applyBasicStretchPreview = function()
   {
      // New chooser always uses STF-style curves; skip legacy gain/clipping search.
      var a = {black:0,gain:1,shoulder:.72,shoulderStrength:.88,clipFraction:0};
      if ( self.sourceWorkingImage == null )
      {
         self.status_Label.text = "Quick Stretch: unable to analyze image";
         return;
      }

      var choice=self.chooseQuickStretch(a);if(choice<0)return;
      self.basicStretchFaintEnabled=choice==1||choice==3;
      self.basicStretchLinearEnabled=choice>=2;
      self.basicStretchEnabled = true;
      self.basicStretchGain = a.gain;
      self.basicStretchBlack = a.black;
      self.basicStretchShoulder = a.shoulder;
      self.basicStretchShoulderStrength = a.shoulderStrength;
      self.quickStretchClipFraction = a.clipFraction;

      self.intensity_Control.setValue( 0.0 );
      self.contrast_Control.setValue( 0.0 );
      self.stretch_Control.setValue( 0.0 );

      // Build a real Quick-Stretched baseline image from the pristine reduced
      // source. All subsequent clicks, overlays, histograms and targeted
      // processing operate on this image.
      var src = self.sourceWorkingImage;
      var stretched = new Image( src );
      var W = src.width;
      var H = src.height;
      var C = src.numberOfChannels;

      for ( var y = 0; y < H; ++y )
         for ( var x = 0; x < W; ++x )
         {
            var lum;
            if ( C < 3 )
               lum = src.sample( x, y, 0 );
            else
               lum = 0.2126*src.sample(x,y,0) +
                     0.7152*src.sample(x,y,1) +
                     0.0722*src.sample(x,y,2);

            var d = Math.max( 1.0e-8, 1-self.basicStretchBlack );
            var normalized = Math.max( 0, (lum-self.basicStretchBlack)/d );
            var newLum = basicStretchCurve(
               normalized,
               self.basicStretchGain,
               self.basicStretchShoulder,
               self.basicStretchShoulderStrength );

            if ( C < 3 )
               stretched.setSample( newLum, x, y, 0 );
            else
            {
               var scale = lum > 1.0e-8 ? newLum/lum : 1;
               for ( var c = 0; c < Math.min(3,C); ++c )
               {
                  var q = src.sample(x,y,c)*scale;
                  stretched.setSample( Math.max(0,Math.min(1,q)), x, y, c );
               }
            }
         }

      if(self.basicStretchFaintEnabled){var lifted=self.quickFaintPass(src);stretched.free();stretched=lifted;}
      if(self.basicStretchLinearEnabled){var linear=self.quickLinearPass(stretched);stretched.free();stretched=linear;}
      if(self.quickNebulosityEnabled){var nebula=self.quickNebulosityPass(stretched,self.quickNebulosityStrength,false,false);stretched.free();stretched=nebula;}
      if(self.basicStretchFaintEnabled||self.basicStretchLinearEnabled){var nearClip=0,total=stretched.width*stretched.height;
         for(var yy=0;yy<stretched.height;yy++)for(var xx=0;xx<stretched.width;xx++){
            var clipped=false;for(var cc=0;cc<Math.min(3,stretched.numberOfChannels);cc++)if(stretched.sample(xx,yy,cc)>=.997)clipped=true;
            if(clipped)nearClip++;
         }self.quickStretchClipFraction=nearClip/Math.max(1,total);
      }
      if ( self.workingImage != null )
         self.workingImage.free();
      self.invalidatePreviewCaches();self.workingImage = stretched;

      if ( self.overlayImage != null )
         self.overlayImage.free();
      self.overlayImage = self.buildOverlayMap( self.workingImage );
      if ( self.processingMask != null )
      {
         self.processingMask.free();
         self.processingMask = null;
      }

      // The histogram now describes exactly the baseline visible in preview.
      self.histogram.setHistogram( calculateHistogram( self.workingImage, 2048, self.channelMode ) );

      self.originalPreviewBitmap =
         self.makeFittedPreviewBitmap( self.workingImage );
      self.processedPreviewBitmap = null;
      self.previewBitmap = self.originalPreviewBitmap;
      self.before_CheckBox.checked = false;

      // Quick Stretch establishes a new baseline. Preserve the Symmetry Point
      // when in symmetry mode; other selection types are baseline-dependent and
      // are cleared.
      if(self.selectionMode=="symmetry")
      {
         var sp=0.5;
         if(self.selections.length==1 &&
            self.selectionType(self.selections[0])=="symmetry")
            sp=self.selections[0].center;
         self.selections=[{type:"symmetry",center:sp,low:sp,high:sp,
                           spatial:false,spatialMask:null}];
      }
      else
         self.selections = [];
      self.samplePoints = [];
      self.sampleX = -1;
      self.sampleY = -1;
      self.syncSelectionUI();

      self.previewZoom.update();
      self.preview.viewport.update();

      self.status_Label.text =
         ((self.quickAnalysisRecipe?"Quick Stretch Image Analysis":"Quick Stretch STF-Style")+(self.quickNebulosityEnabled?" + faint nebulosity":"")+(self.basicStretchLinearEnabled?" + linear endpoints":"")+": black=") + self.basicStretchBlack.toFixed(5) +
         " | gain=" + self.basicStretchGain.toFixed(2) +
         " | shoulder=" + self.basicStretchShoulder.toFixed(3) +
         " | near-clip=" + (100*self.quickStretchClipFraction).toFixed(4) + "%";
      self.autoPeakPendingSP();
      if(self.autoHighContrastEnabled||self.autoColorBrightnessEnabled)self.updateProcessedPreview();
      self.commitHistory();
   };


   this.autoContrastGainMap=function(src){var proxy=new Image(src),mean=null,second=null,map=null;
      var signal=function(im,x,y){return im.numberOfChannels<3?im.sample(x,y,0):.2126*im.sample(x,y,0)+.7152*im.sample(x,y,1)+.0722*im.sample(x,y,2);};
      try{if(proxy.width>640||proxy.height>380)proxy.resample(Math.min(640/proxy.width,380/proxy.height));
         var W=proxy.width,H=proxy.height;mean=SmartTools.boxSignalMean(proxy,12,signal);
         second=SmartTools.boxSignalMean(proxy,12,function(im,x,y){var v=signal(im,x,y);return v*v;});
         var deviations=[];for(var y=0;y<H;y+=4)for(var x=0;x<W;x+=4)deviations.push(Math.abs(signal(proxy,x,y)-.25*(signal(proxy,Math.max(0,x-1),y)+signal(proxy,Math.min(W-1,x+1),y)+signal(proxy,x,Math.max(0,y-1))+signal(proxy,x,Math.min(H-1,y+1)))));
         deviations.sort(function(a,b){return a-b;});var noise=Math.max(.0005,1.3257*percentileFromSortedArray(deviations,.5));
         map=new Image(mean);
         for(var y=0;y<H;y++)for(var x=0;x<W;x++){
            var v=signal(proxy,x,y),m=mean.sample(x,y,0),detail=v-m,sd=Math.sqrt(Math.max(0,second.sample(x,y,0)-m*m));
            var lowContrast=1-smoothStep01((sd/(m+.02)-.08)/.22);
            var confidence=smoothStep01((Math.abs(detail)/noise-1)/2);
            var bright=proxy.numberOfChannels<3?v:Math.max(proxy.sample(x,y,0),proxy.sample(x,y,1),proxy.sample(x,y,2));
            var weight=lowContrast*confidence*(1-smoothStep01((bright-.55)/.30))*smoothStep01((m-.005)/.04);
            var target=v+Math.max(-.08,Math.min(.08,.75*weight*detail));
            var gain=v>1e-8?Math.max(0,Math.min(1/Math.max(1e-8,bright),target/v)):1;
            if(weight<=0||bright>=.85)gain=1;map.setSample(gain,x,y,0);
         }return map;
      }catch(e){if(map)map.free();throw e;}finally{proxy.free();if(mean)mean.free();if(second)second.free();}
   };
   this.autoContrastMapGain=function(map,x,y,W,H){var px=Math.max(0,Math.min(map.width-1,(x+.5)*map.width/W-.5)),py=Math.max(0,Math.min(map.height-1,(y+.5)*map.height/H-.5));
      var ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(ix+1,map.width-1),jy=Math.min(iy+1,map.height-1),fx=px-ix,fy=py-iy;
      return (1-fy)*((1-fx)*map.sample(ix,iy,0)+fx*map.sample(jx,iy,0))+fy*((1-fx)*map.sample(ix,jy,0)+fx*map.sample(jx,jy,0));
   };
   // Native view images are borrowed/read-only; their owning window pool frees them.
   // Detached Image copies belong to this Apply call, even while a native pool exists.
   this.replaceApplyResultWithContrast=function(src,owned){var adjusted=self.applyAutoHighContrast(src);
      if(adjusted===src)return {image:src,owned:owned};
      if(owned)src.free();return {image:adjusted,owned:true};
   };
   this.applyAutoHighContrast=function(src,enabledOverride){if(!(enabledOverride===undefined?self.autoHighContrastEnabled:enabledOverride))return src;
      var t=SmartTools.now(),map,pool={},out=null,C=src.numberOfChannels,cached=false;
      if(src.width*src.height<=1000000){var planes=[];for(var c=0;c<(C<3?1:3);c++)planes.push(SmartTools.readPlane(src,c));var cache=self.autoContrastCache,hit=!!(cache&&cache.W==src.width&&cache.H==src.height&&cache.C==C);
         if(hit)for(var c=0;c<planes.length&&hit;c++)for(var i=0;i<planes[c].length;i++)if(planes[c][i]!==cache.planes[c][i]){hit=false;break;}
         if(!hit){if(cache)cache.map.free();cache=self.autoContrastCache={W:src.width,H:src.height,C:C,planes:planes,map:self.autoContrastGainMap(src)};}
         map=cache.map;cached=true;console.writeln("[Smart Stretch Perf] Auto Contrast gain cache: "+(hit?"HIT":"MISS"));
      }else map=self.autoContrastGainMap(src);
      try{if(src.width*src.height>1000000&&(C==1||C==3)&&typeof PixelMath!="undefined"){
            var w=SmartTools.acquireWindow(pool,"AutoContrast",src.width,src.height,C,src.bitsPerSample==64?64:32,C==3),g=SmartTools.acquireWindow(pool,"AutoContrastGain",map.width,map.height,1,64,false);
            SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(src);}finally{w.mainView.endProcess();}
            SmartTools.beginPrivateProcess(g.mainView);try{g.mainView.image.assign(map);}finally{g.mainView.endProcess();}
            var p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;p.symbols="acX,acY,acI,acJ,acF,acV,acM";
            p.expression="acX=min("+(map.width-1)+",max(0,(x()+0.5)*"+(map.width/src.width)+"-0.5));acY=min("+(map.height-1)+",max(0,(y()+0.5)*"+(map.height/src.height)+"-0.5));acI=floor(acX);acJ=floor(acY);acF=acX-acI;acV=acY-acJ;acM="+(C==3?"max(max($T[0],$T[1]),$T[2])":"$T")+";"+
               "acX=(1-acV)*((1-acF)*pixel("+g.mainView.id+",acI,acJ)+acF*pixel("+g.mainView.id+",min(acI+1,"+(map.width-1)+"),acJ))+acV*((1-acF)*pixel("+g.mainView.id+",acI,min(acJ+1,"+(map.height-1)+"))+acF*pixel("+g.mainView.id+",min(acI+1,"+(map.width-1)+"),min(acJ+1,"+(map.height-1)+")));$T*iif(acM>=0.85,1,min(acX,1/max(1e-8,acM)))";
            if(!p.executeOn(w.mainView,false))throw new Error("Auto High Contrast native processing failed");out=new Image(w.mainView.image);
         }else{out=new Image(src);for(var y=0;y<src.height;y++)for(var x=0;x<src.width;x++){
            var maxv=C<3?src.sample(x,y,0):Math.max(src.sample(x,y,0),src.sample(x,y,1),src.sample(x,y,2));
            var gain=maxv>=.85?1:Math.min(self.autoContrastMapGain(map,x,y,src.width,src.height),1/Math.max(1e-8,maxv));
            for(var c=0;c<(C<3?1:3);c++)out.setSample(src.sample(x,y,c)*gain,x,y,c);
         }}
         var maxError=0;for(var y=0;y<16;y++)for(var x=0;x<24;x++){
            var xx=Math.min(src.width-1,Math.floor((x+.5)*src.width/24)),yy=Math.min(src.height-1,Math.floor((y+.5)*src.height/16));
            var maxv=C<3?src.sample(xx,yy,0):Math.max(src.sample(xx,yy,0),src.sample(xx,yy,1),src.sample(xx,yy,2));
            var gain=maxv>=.85?1:Math.min(self.autoContrastMapGain(map,xx,yy,src.width,src.height),1/Math.max(1e-8,maxv));
            for(var c=0;c<(C<3?1:3);c++){var actual=out.sample(xx,yy,c),error=Math.abs(actual-src.sample(xx,yy,c)*gain);if(!isFinite(actual))throw new Error("Nonfinite Auto Contrast result");maxError=Math.max(maxError,error);}
         }if(maxError>2e-7)throw new Error("Auto High Contrast validation failed");
         console.writeln("[Smart Stretch Auto Contrast] time="+((SmartTools.now()-t)/1000).toFixed(3)+" s | map="+map.width+"x"+map.height+" | max error="+maxError);return out;
      }catch(e){if(out)out.free();throw e;}finally{if(!cached)map.free();SmartTools.closeWindowPool(pool);}
   };

   this.buildLocalSignalMean = function(image,radius)
   {
      return SmartTools.boxSignalMean(image,radius,self.signalValueAt);
   };

   this.invalidatePreviewCaches = function()
   {
      if(self.previewNativePool)SmartTools.closeWindowPool(self.previewNativePool);self.previewNativeUses=0;
      if(self.autoContrastCache){self.autoContrastCache.map.free();self.autoContrastCache=null;}
      if(self.hdrMeanCache){self.hdrMeanCache.image.free();self.hdrMeanCache=null;}self.boundaryGeometryCache=null;
      self.signalPlaneCache=null; self.maskPlaneCache=null; self.rangePlaneCache=null;
      self.stretchCurveCache=null;self.lowContrastCache=null;
      if(self.localMeanCache!=null)
      {
         self.localMeanCache.free();
         self.localMeanCache=null;
      }
      self.localMeanCacheChannel="";
   };

   this.signalFocusRegions=function(){var out=[];for(var i=0;i<self.selections.length;i++){var q=self.selections[i];if(self.selectionType(q)=="signal")out.push({center:SmartTools.clamp(q.center,.000001,.999999),width:Math.max(1e-6,(q.high-q.low)/2)});}return out;};
   this.signalFocusCenter=function(v,regions){var sp=self.committedSP,best=1e30;for(var i=0;i<regions.length;i++){var d=Math.abs(v-regions[i].center)/regions[i].width;if(d<best){best=d;sp=regions[i].center;}}return SmartTools.clamp(sp,.000001,.999999);};
   this.maskFocusWeight=function(v,regions){
      if(self.stretchFocus=="center"||(self.selectionMode!="signal"&&self.selectionMode!="symmetry"))return 1;
      var sp=self.selectionMode=="symmetry"?self.committedSP:self.signalFocusCenter(v,regions);
      return SmartTools.clamp(focusedStretchValue(v,v+1,sp,self.stretchFocus)-v,0,1);
   };
   this.focusSignalValue=function(v,base){if(self.selectionMode!="signal")return base;return focusedStretchValue(v,base,self.signalFocusCenter(v,self.signalFocusRegions()),self.stretchFocus);};
   this.prepareFocusedStretch=function(stretch,sp,li,symmetry)
   {
      var curve=SmartTools.prepareStretch(stretch,sp,li,symmetry);
      var focus=self.stretchFocus;
      if(focus=="center"||(!symmetry&&self.selectionMode!="signal"))return curve;
      var regions=symmetry?null:self.signalFocusRegions();
      return function(v){return focusedStretchValue(v,curve(v),symmetry?sp:self.signalFocusCenter(v,regions),focus);};
   };
   // Same smoothstep taper as the JavaScript reference, using ssD scratch.
   this.nativeFocusCode=function(sp,signal)
   {
      var focus=self.stretchFocus,n=function(v){return Number(v).toPrecision(17);};
      if(focus!="left" && focus!="right")return "";
      var code="",pivot=n(SmartTools.clamp(sp,.000001,.999999));
      if(signal){var regions=self.signalFocusRegions();code="ssP="+pivot+";ssZ=1e30;";
         for(var i=0;i<regions.length;i++){var q=regions[i];code+="ssD=abs(ssV-"+n(q.center)+")/"+n(q.width)+";ssP=iif(ssD<ssZ,"+n(q.center)+",ssP);ssZ=min(ssZ,ssD);";}pivot="ssP";}
      var left=focus=="left";
      return code+"ssD=min(1,max(0,"+(left?"("+pivot+"-ssV)":"(ssV-"+pivot+")")+
         "/(.05*"+(left?pivot:"(1-"+pivot+")")+")));ssC=ssV+ssD*ssD*(3-2*ssD)*(ssC-ssV);";
   };

   this.histogram.onFocusWeight=function(v){return self.maskFocusWeight(v,self.signalFocusRegions());};
   this.getStretchEvaluator=function(stretch,sp,li,symmetry)
   {
      if(self.exactReferencePass)return function(v){return symmetry?
         symmetryPointStretchValue(v,stretch,sp,li,self.stretchFocus):self.focusSignalValue(v,localizedStretchValue(v,stretch,li));};
      var key=[stretch,sp,li,symmetry,self.stretchFocus,self.selectionMode,JSON.stringify(self.signalFocusRegions())].join("|");
      if(self.stretchCurveCache==null || self.stretchCurveCache.key!=key)
      {
         var t=SmartTools.now();
         var exact=self.prepareFocusedStretch(stretch,sp,li,symmetry);
         var curve=stretch<=0||(!symmetry&&self.selectionMode=="signal"&&self.stretchFocus!="center")?exact:SmartTools.stretchLUT(exact);
         self.stretchCurveCache={key:key,curve:curve};
         console.writeln("[Smart Stretch LUT] build="+SmartTools.elapsed(t)+
            " | safe cells="+(curve.safeCells||0)+" | exact fallback enabled");
      }
      return self.stretchCurveCache.curve;
   };

   this.getPreviewPlane=function(image,mode,slot)
   {
      var cache=self[slot];
      if(cache==null || cache.image!==image || cache.mode!=mode)
         self[slot]=cache={image:image,mode:mode,data:SmartTools.signalPlane(image,mode)};
      return cache.data;
   };

   this.getLocalSignalMean = function()
   {
      if(self.workingImage==null)return null;
      if(self.localMeanCache==null ||
         self.localMeanCacheChannel!=self.channelMode)
      {
         self.invalidatePreviewCaches();
         self.localMeanCache=self.buildLocalSignalMean(self.workingImage,7);
         self.localMeanCacheChannel=self.channelMode;
      }
      return self.localMeanCache;
   };

   this.applyReferenceAwareHDR = function( candidate, strength, scale, referenceOverride, maskOverride )
   {
      if(!self.hdrEnable_CheckBox.checked || strength<=0 ||
         candidate==null || candidate.numberOfChannels<3)
         return {image:candidate, affected:0, colorRecovered:0};

      var W=candidate.width,H=candidate.height,C=candidate.numberOfChannels;
      // The reference is deliberately pre-targeted-processing. If Quick Stretch
      // is active, workingImage is the auto-stretched baseline; otherwise use
      // the original reduced source. This preserves color ratios that may have
      // disappeared from the current candidate through channel clipping.
      var reference=referenceOverride!=null ? referenceOverride :
         (self.basicStretchEnabled ? self.workingImage : self.sourceWorkingImage);
      if(reference==null || reference.numberOfChannels<3)
         return {image:candidate, affected:0, colorRecovered:0};

      var radius=Math.max(3,Math.round(3+29*Math.max(0,Math.min(1,scale))));
      var local;
      if(W*H>1000000)local=self.buildLocalSignalMean(candidate,radius);
      else{
      var hdrPlane=SmartTools.signalPlane(candidate,self.channelMode),cache=self.hdrMeanCache,hit=!!(cache&&cache.radius==radius&&cache.W==W&&cache.H==H&&cache.mode==self.channelMode);
      if(hit)for(var ci=0;ci<hdrPlane.length;ci++)if(hdrPlane[ci]!==cache.plane[ci]){hit=false;break;}
      if(!hit){if(cache)cache.image.free();cache=self.hdrMeanCache={W:W,H:H,mode:self.channelMode,radius:radius,plane:hdrPlane,image:self.buildLocalSignalMean(candidate,radius)};}
      local=cache.image;console.writeln("[Smart Stretch Perf] HDR local mean cache: "+(hit?"HIT":"MISS"));
      }
      var out=new Image(candidate);
      var affected=0,recovered=0;

      for(var y=0;y<H;++y)
         for(var x=0;x<W;++x)
         {
            var activeMask=maskOverride!=null ? maskOverride : self.processingMask;
            var mask=activeMask!=null ? activeMask.sample(x,y,0) : 1.0;
            if(mask<=1.0e-8)continue;

            var lum=self.signalValueAt(candidate,x,y);
            var lm=local.sample(x,y,0);
            var excess=Math.max(0,lum-lm);

            // HDR engages progressively in bright material and compresses only
            // brightness above the local reference level. Faint material and
            // negative local detail are left alone.
            var brightGate=smoothStep01((lum-0.48)/0.42);
            var amount=strength*brightGate*mask;
            if(amount<=1.0e-8 || excess<=1.0e-8)continue;

            // Rational compression is monotonic and cannot invert local tones.
            var compressedExcess=excess/(1.0+8.0*strength*excess);
            var hdrLum=lum-amount*(excess-compressedExcess);
            hdrLum=Math.max(0,Math.min(1,hdrLum));

            var cr=candidate.sample(x,y,0);
            var cg=candidate.sample(x,y,1);
            var cb=candidate.sample(x,y,2);
            var rr=reference.sample(x,y,0);
            var rg=reference.sample(x,y,1);
            var rb=reference.sample(x,y,2);

            // Measure how unreliable current color has become. Approaching
            // channel saturation raises the recovery weight before pure white
            // clipping occurs.
            var maxC=Math.max(cr,cg,cb),minC=Math.min(cr,cg,cb);
            var maxR=Math.max(rr,rg,rb),minR=Math.min(rr,rg,rb);
            var satRisk=smoothStep01((maxC-0.84)/0.15);
            var currentChroma=(maxC-minC)/Math.max(1.0e-6,maxC);
            var refChroma=(maxR-minR)/Math.max(1.0e-6,maxR);
            var chromaLoss=smoothStep01((refChroma-currentChroma)/0.30);
            var recover=amount*Math.max(satRisk,chromaLoss);

            // Candidate chromaticity, normalized to Rec.709 luminance.
            var cLum=Math.max(1.0e-8,
               0.2126*cr+0.7152*cg+0.0722*cb);
            var rLum=Math.max(1.0e-8,
               0.2126*rr+0.7152*rg+0.0722*rb);
            var cR=cr/cLum,cG=cg/cLum,cB=cb/cLum;
            var rR=rr/rLum,rG=rg/rLum,rB=rb/rLum;

            // Blend chromaticity only; brightness/detail comes from the HDR
            // result. We never copy the reference pixel's old luminance.
            var qR=(1-recover)*cR+recover*rR;
            var qG=(1-recover)*cG+recover*rG;
            var qB=(1-recover)*cB+recover*rB;
            var qLum=Math.max(1.0e-8,0.2126*qR+0.7152*qG+0.0722*qB);
            qR/=qLum;qG/=qLum;qB/=qLum;

            out.setSample(Math.max(0,Math.min(1,hdrLum*qR)),x,y,0);
            out.setSample(Math.max(0,Math.min(1,hdrLum*qG)),x,y,1);
            out.setSample(Math.max(0,Math.min(1,hdrLum*qB)),x,y,2);
            for(var ch=3;ch<C;++ch)
               out.setSample(candidate.sample(x,y,ch),x,y,ch);

            ++affected;
            if(recover>0.02)++recovered;
         }

      if(W*H>1000000)local.free();
      return {image:out,affected:affected,colorRecovered:recovered};
   };

   this.buildFullAdaptiveBoundarySafety = function( src, candidate, strength, maskOverride )
   {
      var activeMask=maskOverride!=null ? maskOverride : self.processingMask;
      if(strength<=0 || activeMask==null)return null;
      var W=src.width,H=src.height,safety=new Image(W,H,1);
      safety.fill(1.0);
      var triggered=0;
      for(var y=1;y<H-1;++y)
         for(var x=1;x<W-1;++x)
         {
            var m=activeMask.sample(x,y,0),minM=m,maxM=m,n;
            n=activeMask.sample(x-1,y,0);minM=Math.min(minM,n);maxM=Math.max(maxM,n);
            n=activeMask.sample(x+1,y,0);minM=Math.min(minM,n);maxM=Math.max(maxM,n);
            n=activeMask.sample(x,y-1,0);minM=Math.min(minM,n);maxM=Math.max(maxM,n);
            n=activeMask.sample(x,y+1,0);minM=Math.min(minM,n);maxM=Math.max(maxM,n);
            var boundary=maxM-minM;
            if(boundary<0.08)continue;
            var o=self.signalValueAt(src,x,y),q=self.signalValueAt(candidate,x,y);
            var oe=0,qe=0;
            oe+=Math.abs(o-self.signalValueAt(src,x-1,y)); qe+=Math.abs(q-self.signalValueAt(candidate,x-1,y));
            oe+=Math.abs(o-self.signalValueAt(src,x+1,y)); qe+=Math.abs(q-self.signalValueAt(candidate,x+1,y));
            oe+=Math.abs(o-self.signalValueAt(src,x,y-1)); qe+=Math.abs(q-self.signalValueAt(candidate,x,y-1));
            oe+=Math.abs(o-self.signalValueAt(src,x,y+1)); qe+=Math.abs(q-self.signalValueAt(candidate,x,y+1));
            var created=Math.max(0,0.25*(qe-oe));
            var risk=smoothStep01((created-0.006)/0.055)*boundary*strength;
            if(risk>0.02)++triggered;
            safety.setSample(1.0-Math.min(0.95,risk),x,y,0);
         }
      // Feather the limiting band outward so intervention cannot itself form
      // a visible line.
      if(triggered==0)
      {
         safety.free();
         self.adaptiveBoundaryTriggered=false;
         self.adaptiveBoundaryTriggerCount=0;
         return null;
      }
      for(var pass=0;pass<5;++pass)
      {
         var next=new Image(safety);
         for(var yy=1;yy<H-1;++yy)
            for(var xx=1;xx<W-1;++xx)
            {
               var s=safety.sample(xx,yy,0);
               var a=0.25*(safety.sample(xx-1,yy,0)+safety.sample(xx+1,yy,0)+
                           safety.sample(xx,yy-1,0)+safety.sample(xx,yy+1,0));
               if(a<s)next.setSample(0.65*s+0.35*a,xx,yy,0);
            }
         safety.free(); safety=next;
      }
      self.adaptiveBoundaryTriggered=triggered>0;
      self.adaptiveBoundaryTriggerCount=triggered;
      return safety;
   };

   this.buildAdaptiveBoundarySafety = function( src, candidate, strength, maskOverride )
   {
      if(src.width*src.height>1000000)return self.buildFullAdaptiveBoundarySafety(src,candidate,strength,maskOverride);
      var activeMask=maskOverride!=null ? maskOverride : self.processingMask;
      if(strength<=0 || activeMask==null)return null;
      var W=src.width,H=src.height,original=SmartTools.signalPlane(src,self.channelMode),current=SmartTools.signalPlane(candidate,self.channelMode),mask=SmartTools.readPlane(activeMask,0);
      var cache=self.boundaryGeometryCache,hit=!!(cache&&cache.W==W&&cache.H==H&&cache.mode==self.channelMode);
      if(hit)for(var i=0;i<mask.length;i++)if(mask[i]!==cache.mask[i]||original[i]!==cache.original[i]){hit=false;break;}
      if(!hit){cache=self.boundaryGeometryCache={W:W,H:H,mode:self.channelMode,mask:mask,original:original,boundary:new Array(W*H),edge:new Array(W*H)};
         for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){var i=y*W+x,ns=[i-1,i+1,i-W,i+W],lo=mask[i],hi=lo,edge=0;
            for(var n=0;n<4;n++){lo=Math.min(lo,mask[ns[n]]);hi=Math.max(hi,mask[ns[n]]);edge+=Math.abs(original[i]-original[ns[n]]);}cache.boundary[i]=hi-lo;cache.edge[i]=edge;}}
      console.writeln("[Smart Stretch Perf] Boundary geometry cache: "+(hit?"HIT":"MISS"));
      var safety=new Image(W,H,1),pixels=new Array(W*H),spare=new Array(W*H),triggered=0;for(var i=0;i<pixels.length;i++)pixels[i]=1;
      for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){var i=y*W+x,boundary=cache.boundary[i];if(boundary<.08)continue;
         var q=current[i],qe=Math.abs(q-current[i-1])+Math.abs(q-current[i+1])+Math.abs(q-current[i-W])+Math.abs(q-current[i+W]);
         var created=Math.max(0,.25*(qe-cache.edge[i])),risk=smoothStep01((created-.006)/.055)*boundary*strength;
         if(risk>.02)triggered++;pixels[i]=1-Math.min(.95,risk);}
      // Feather the limiting band outward so intervention cannot itself form
      // a visible line.
      if(triggered==0)
      {
         safety.free();
         self.adaptiveBoundaryTriggered=false;
         self.adaptiveBoundaryTriggerCount=0;
         return null;
      }
      for(var pass=0;pass<5;pass++){for(var i=0;i<pixels.length;i++)spare[i]=pixels[i];
         for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){var i=y*W+x,v=pixels[i],a=.25*(pixels[i-1]+pixels[i+1]+pixels[i-W]+pixels[i+W]);if(a<v)spare[i]=.65*v+.35*a;}
         var swap=pixels;pixels=spare;spare=swap;}
      SmartTools.writePlane(safety,pixels,0);
      self.adaptiveBoundaryTriggered=triggered>0;
      self.adaptiveBoundaryTriggerCount=triggered;
      return safety;
   };

   // Native PixelMath fast path for global Adaptive Symmetry-Stretch.
   // A temporary window makes native execution transactional: the source view
   // is only changed after PixelMath has completed successfully.
   // Quick Stretch retains its black point, rational gain and late shoulder.
   // Native execution evaluates the exact curve; no LUT approximation is used.
   this.nativeQuickExpression=function(source,C,gainOutput)
   {
      function n(v){if(!isFinite(v))throw new Error("Nonfinite Quick Stretch parameter");return Number(v).toPrecision(17);}
      var black=self.basicStretchBlack,gain=self.basicStretchGain;
      var shoulder=self.basicStretchShoulder,strength=self.basicStretchShoulderStrength;
      var lum=C==1?source:"(.2126*"+source+"[0]+.7152*"+source+"[1]+.0722*"+source+"[2])";
      var e="qsV="+lum+";qsX=min(1,max(0,(qsV-"+n(black)+")/"+n(Math.max(1e-8,1-black)) +"));";
      if(gain<=1)e+="qsN=qsX;";
      else{
         e+="qsN=("+n(gain)+"*qsX)/(1+"+n(gain-1)+"*qsX);";
         e+="qsT=min(1,max(0,(qsX-"+n(shoulder)+")/"+n(Math.max(1e-8,1-shoulder))+"));";
         e+="qsP="+n(strength)+"*qsT*qsT*(3-2*qsT);";
         e+="qsN=iif(qsX>"+n(shoulder)+",qsN*(1-qsP)+qsX*qsP,qsN);qsN=min(1,max(0,qsN));";
      }
      return e+(gainOutput?"iif(qsV>1e-8,qsN/max(1e-8,qsV),1)":"qsN");
   };

   this.validateNativeQuick=function(src,out)
   {
      var W=src.width,H=src.height,C=src.numberOfChannels;
      if(out.width!=W||out.height!=H||out.numberOfChannels!=C)throw new Error("Native Quick Stretch geometry mismatch");
      var step=Math.max(1,Math.ceil(Math.sqrt(W*H/4096))),count=0,maxError=0,sum=0;
      for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step){
         var v=C==1?src.sample(x,y,0):.2126*src.sample(x,y,0)+.7152*src.sample(x,y,1)+.0722*src.sample(x,y,2);
         var normalized=Math.max(0,(v-self.basicStretchBlack)/Math.max(1e-8,1-self.basicStretchBlack));
         var target=basicStretchCurve(normalized,self.basicStretchGain,self.basicStretchShoulder,self.basicStretchShoulderStrength);
         var ratio=v>1e-8?target/v:1;
         for(var c=0;c<C;c++){
            var expected=C==1?target:Math.max(0,Math.min(1,src.sample(x,y,c)*ratio));
            var error=Math.abs(expected-out.sample(x,y,c));
            if(!isFinite(error))throw new Error("Native Quick Stretch nonfinite sample");
            maxError=Math.max(maxError,error);sum+=error;count++;
         }
      }
      console.writeln("[Smart Stretch Apply] Native Quick validation: samples="+count+
         " | mean abs error="+(sum/Math.max(1,count)).toFixed(10)+" | max abs error="+maxError.toFixed(10));
      if(maxError>2e-7)throw new Error("Native Quick Stretch validation failed; refusing native baseline");
   };

   this.processNativeQuickPass=function(src,borrowOutput)
   {
      var W=src.width,H=src.height,C=src.numberOfChannels;
      if((C!=1&&C!=3)||src.isReal===false)throw new Error("Native Quick Stretch requires floating-point mono or RGB");
      var pool=borrowOutput?self.nativeQuickWorkspace:{},complete=false,temp=null;
      var total=SmartTools.now(),t=total;
      try{
         temp=SmartTools.acquireWindow(pool,"QuickBase",W,H,C,src.bitsPerSample==64?64:32,C==3);
         SmartTools.beginPrivateProcess(temp.mainView);
         try{temp.mainView.image.assign(src);temp.mainView.image.resetSelections();}
         finally{temp.mainView.endProcess();}
         self.logApplyStage("Native Quick: source copy / workspace",t);t=SmartTools.now();
         var p=SmartTools.configurePixelMath(new PixelMath,64);
         p.useSingleExpression=true;p.symbols="qsV,qsX,qsN,qsT,qsP";
         if(C==3){
            var map=SmartTools.acquireWindow(pool,"QuickGain",W,H,1,64,false);
            p.expression=self.nativeQuickExpression(temp.mainView.id,C,true);
            // Gain can greatly exceed one. Never truncate this intermediate.
            p.truncate=false;
            if(!p.executeOn(map.mainView,false))throw new Error("Native Quick gain evaluation failed");
            self.logApplyStage("Native Quick: exact gain map (64-bit)",t);t=SmartTools.now();
            p=SmartTools.configurePixelMath(new PixelMath,64);p.useSingleExpression=true;
            p.expression="$T*"+map.mainView.id;
            if(!p.executeOn(temp.mainView,false))throw new Error("Native Quick RGB multiplication failed");
            self.logApplyStage("Native Quick: combined RGB multiplication / clipping",t);
         }else{
            p.expression=self.nativeQuickExpression("$T",C,false);
            if(!p.executeOn(temp.mainView,false))throw new Error("Native Quick mono transform failed");
            self.logApplyStage("Native Quick: exact mono transform",t);
         }
         t=SmartTools.now();self.validateNativeQuick(src,temp.mainView.image);
         self.logApplyStage("Native Quick: numerical validation",t);
         if(borrowOutput){complete=true;return temp.mainView.image;}
         t=SmartTools.now();var result=new Image(temp.mainView.image);
         self.logApplyStage("Native Quick: detached fallback baseline copy",t);complete=true;return result;
      }finally{
         if(!borrowOutput||!complete)SmartTools.closeWindowPool(pool);
         self.logApplyStage("Native Quick: total baseline processing",total);
      }
   };

   this.processNativeQuick=function(src,borrowOutput){var result=self.basicStretchFaintEnabled?self.processNativeQuickFaint(src,borrowOutput):self.processNativeQuickPass(src,borrowOutput);
      try{if(self.basicStretchLinearEnabled){var linear=self.processNativeQuickLinear(result,borrowOutput);if(!borrowOutput)result.free();result=linear;}
         if(self.quickNebulosityEnabled){var nebula=self.quickNebulosityPass(result,self.quickNebulosityStrength,borrowOutput,false);if(!borrowOutput)result.free();result=nebula;}
         return result;}
      catch(e){if(!borrowOutput)result.free();throw e;}
   };
   this.canUseNativeAS = function(image)
   {
      return self.quickAnalysisRecipe==null && self.selectionMode=="symmetry" &&
         (!self.basicStretchEnabled || image.isReal!==false) &&
         self.smartMask==null &&
         !self.hdrEnable_CheckBox.checked &&
         Math.abs(self.contrast_Control.value)<1.0e-8 &&
         image.numberOfChannels<=3 &&
         (image.numberOfChannels==1 || image.numberOfChannels==3) &&
         typeof PixelMath!="undefined";
   };

   this.nativeNumber=function(v)
   {
      if(!isFinite(v))throw new Error("Nonfinite native stretch parameter");
      return Number(v).toPrecision(16);
   };

   this.nativeASExpression=function(image,channel)
   {
      var n=self.nativeNumber,k=Math.pow(10,0.375*self.stretch_Control.value)-1;
      var sp=Math.max(0.000001,Math.min(0.999999,self.committedSP));
      var li=Math.max(0,Math.min(1,self.localIntensity_Control.value));
      var rgb=image.numberOfChannels==3,selected={R:0,G:1,B:2}[self.channelMode];
      var original=rgb?"$T["+channel+"]":"$T";
      if(rgb && selected!=null && selected!=channel)return original;
      var lum=!rgb?"$T":selected!=null?"$T["+selected+"]":
         "(0.2126*$T[0]+0.7152*$T[1]+0.0722*$T[2])";
      var code="ssV="+lum+";";
      if(k<1e-8)code+="ssC=ssV;";
      else
      {
         var den=Math.log(k+Math.sqrt(1+k*k));
         code+="ssP=(ssV-"+n(sp)+")*iif(ssV<"+n(sp)+","+n(1/sp)+","+n(1/(1-sp))+");";
         code+="ssZ="+n(k)+"*abs(ssP);";
         code+="ssC="+n(sp)+"+iif(ssV<"+n(sp)+",-"+n(sp)+","+n(1-sp)+
            ")*ln(ssZ+sqrt(1+ssZ*ssZ))*"+n(1/den)+";";
         if(Math.abs(li-0.5)>=1e-8)
         {
            code+="ssD=(min(1,max(-1,ssP))-("+n(2*li-1)+"))*"+n(1/0.70)+";";
            code+="ssC=ssV+(0.18+0.82*exp(-0.5*ssD*ssD))*(ssC-ssV);";
         }
      }
      code+=self.nativeFocusCode(sp);
      code+="ssN=min(1,max(0,ssC+"+n(0.875*self.intensity_Control.value)+"));";
      var shadows=self.protectShadows_Control.value,highlights=self.protectHighlights_Control.value;
      if(shadows>0){
         code+="ssD=min(1,max(0,ssV*4));";
         code+="ssN=ssV+(1-"+n(shadows)+"*(1-ssD*ssD*(3-2*ssD)))*(ssN-ssV);";
      }
      if(highlights>0){
         code+="ssD=min(1,max(0,(ssV-0.75)*4));";
         code+="ssN=ssV+(1-"+n(highlights)+"*ssD*ssD*(3-2*ssD))*(ssN-ssV);";
      }
      return code+(!rgb || selected!=null?"ssN":
         "min(1,max(0,"+original+"*iif(ssV>1e-8,ssN/max(1e-8,ssV),1)))");
   };

   this.prepareNativeTable=function()
   {
      var sp=Math.max(0.000001,Math.min(0.999999,self.committedSP));
      var strength=0.5*self.stretch_Control.value,li=self.localIntensity_Control.value;
      var intensity=0.875*self.intensity_Control.value;
      var shadows=self.protectShadows_Control.value,highlights=self.protectHighlights_Control.value;
      var key=[sp,strength,li,intensity,shadows,highlights,self.stretchFocus].join("|");
      if(self.nativeTableCache && self.nativeTableCache.key==key)return self.nativeTableCache.table;
      var start=SmartTools.now(),curve=self.prepareFocusedStretch(strength,sp,li,true);
      var exact=function(v){
         var target=Math.max(0,Math.min(1,curve(v)+intensity));
         return v+tonalProtectionFactor(v,shadows,highlights)*(target-v);
      };
      var table=SmartTools.nativeStretchTable(exact,sp,32768,2e-7);
      self.nativeTableCache={key:key,table:table};
      if(table)console.writeln("[Smart Stretch Apply] Native LUT: "+table.cells+
         " cells; seven probes/cell; max target error="+table.probeMaxError);
      else console.writeln("[Smart Stretch Apply] Native LUT rejected by interpolation checks; exact curve retained");
      self.logApplyStage("Native: LUT build and interpolation checks",start);
      return table;
   };

   this.prepareNativeContext=function(source)
   {
      var start=SmartTools.now(),pool=self.nativeWorkspace||(self.nativeWorkspace={});
      var temp=SmartTools.acquireWindow(pool,"NativeTemp",source.width,source.height,
         source.numberOfChannels,source.bitsPerSample==64?64:32,source.numberOfChannels==3);
      SmartTools.beginPrivateProcess(temp.mainView);
      try{temp.mainView.image.assign(source);temp.mainView.image.resetSelections();}
      finally{temp.mainView.endProcess();}
      self.nativePreparedSource=source;
      self.logApplyStage("Native: full-size source allocation/copy",start);
      var extremaStart=SmartTools.now();
      var lo=1,hi=0;
      try{
         for(var ch=0;ch<source.numberOfChannels;++ch){
            temp.mainView.image.selectedChannel=ch;
            lo=Math.min(lo,temp.mainView.image.minimum());
            hi=Math.max(hi,temp.mainView.image.maximum());
         }
      }finally{temp.mainView.image.resetSelections();}
      self.logApplyStage("Native: complete source extrema scan",extremaStart);
      var parameterKey=[self.stretchFocus,self.committedSP,self.stretch_Control.value,self.localIntensity_Control.value,
         self.intensity_Control.value,self.protectShadows_Control.value,self.protectHighlights_Control.value].join("|");
      var key=[parameterKey,source.numberOfChannels,self.channelMode,lo,hi].join("|");
      if(self.nativeContext && self.nativeContext.key==key){
         self.nativeContext.source=source;return self.nativeContext;
      }
      var sp=Math.max(0.000001,Math.min(0.999999,self.committedSP));
      var curve=self.prepareFocusedStretch(0.5*self.stretch_Control.value,sp,self.localIntensity_Control.value,true);
      var intensity=0.875*self.intensity_Control.value;
      var shadows=self.protectShadows_Control.value,highlights=self.protectHighlights_Control.value;
      var exact=function(v){var target=Math.max(0,Math.min(1,curve(v)+intensity));
         return v+tonalProtectionFactor(v,shadows,highlights)*(target-v);};
      var globalRGB=source.numberOfChannels==3 && self.channelMode!="R" && self.channelMode!="G" && self.channelMode!="B";
      // Store only the exact curve and domain. Build a table when its candidate
      // is reached; failed builds (null) are cached along with successful ones.
      var context={source:source,key:key,low:lo,high:hi,sp:sp,exact:exact,
         globalRGB:globalRGB,tables:{}};
      self.nativeContext=context;
      return context;
   };

   this.ensureNativeTable=function(context,kind)
   {
      if(context.tables.hasOwnProperty(kind))return context.tables[kind];
      var start=SmartTools.now(),table=null;
      if(kind=="piecewiseGain" && context.globalRGB)
         table=SmartTools.piecewiseGainTable(context.exact,context.low,context.high,context.sp,context.high);
      else if(kind=="uniformGain" && context.globalRGB)
         table=SmartTools.uniformNativeTable(context.exact,context.low,context.high,16384,true,context.high);
      else if(kind=="uniformTarget")
         table=SmartTools.uniformNativeTable(context.exact,context.low,context.high,16384,false,context.high);
      else if(kind=="nonuniform" && context.low>=0 && context.high<=1)
         table=self.prepareNativeTable();
      if(table)table.key=context.key+"|"+kind;
      context.tables[kind]=table;
      console.writeln("[Smart Stretch Apply] Native lazy table: "+kind+" | accepted="+!!table+
         (table?" | cells="+table.cells+" | segments="+(table.piecewise?table.segments.length:1)+
         " | max probed output error="+table.probeMaxError:""));
      self.logApplyStage("Native: lazy "+kind+" LUT construction/checks",start);
      return table;
   };

   this.nativeProfileName=function(profile)
   {
      return (profile.kind|| (profile.lut?"nonuniform":"exact"))+" / "+profile.bits+"-bit / "+
         (profile.direct?"separate channels":profile.fused?"combined":"gain map");
   };

   // Deterministic candidates: no timing probes, warm-ups or calibration.
   // Each candidate still requires numerical preflight and output validation.
   this.nativeProfiles=function(context)
   {
      var profiles=[];
      var add=function(kind,lut){
         // Native scalar gain first for global RGB. Retain combined execution
         // as a fallback, with identical curve/table and validation thresholds.
         if(context.globalRGB){
            profiles.push({kind:kind,lut:!!lut,direct:false,fused:false,bits:32});
            profiles.push({kind:kind,lut:!!lut,direct:false,fused:false,bits:64});
         }
         profiles.push({kind:kind,lut:!!lut,direct:false,fused:true,bits:32});
         profiles.push({kind:kind,lut:!!lut,direct:false,fused:true,bits:64});
      };
      if(context.globalRGB){add("piecewiseGain",true);add("uniformGain",true);}
      add("uniformTarget",true);
      add("nonuniform",true);
      add("exact",false);
      if(!context.globalRGB)profiles.push({kind:"exact",lut:false,direct:false,bits:64,fused:false});
      profiles.push({kind:"exact",lut:false,bits:64,direct:true,fused:false});
      return profiles;
   };

   this.nativeLUTExpression=function(image,channel,lutID,table)
   {
      var rgb=image.numberOfChannels==3,selected={R:0,G:1,B:2}[self.channelMode];
      var original=rgb?"$T["+channel+"]":"$T";
      if(rgb && selected!=null && selected!=channel)return original;
      var lum=!rgb?"$T":selected!=null?"$T["+selected+"]":
         "(0.2126*$T[0]+0.7152*$T[1]+0.0722*$T[2])";
      var n=self.nativeNumber,sp=table.hasOwnProperty("sp")?table.sp:0.5;
      var code="ssV="+lum+";";
      if(table.piecewise){
         var segments=table.segments;
         var coordinate=function(segment){return "("+n(segment.offset)+"+(ssV-"+
            n(segment.low)+")*"+n(segment.cells/(segment.high-segment.low))+")";};
         var mapped=coordinate(segments[segments.length-1]);
         for(var j=segments.length-2;j>=0;--j)
            mapped="iif(ssV<"+n(segments[j].high)+","+coordinate(segments[j])+","+mapped+")";
         code+="ssZ="+mapped+";";
      }
      else if(table.uniform)
         code+="ssZ=(ssV-"+n(table.low)+")*"+n(table.cells/(table.high-table.low))+";";
      else{
      code+="ssP=(ssV-"+n(sp)+")*iif(ssV<"+n(sp)+","+n(1/sp)+","+n(1/(1-sp))+");";
      code+="ssZ="+table.halfCells+"*(1+iif(ssV<"+n(sp)+",-1,1)*sqrt(sqrt(abs(ssP))));";
      }
      code+="ssZ=min("+table.cells+",max(0,ssZ));ssI=min("+(table.cells-1)+",floor(ssZ));";
      code+="ssC=pixel("+lutID+",ssI,0,0);ssN=ssC+(ssZ-ssI)*(pixel("+lutID+",ssI+1,0,0)-ssC);";
      return code+(!rgb || selected!=null?"ssN":table.gain?original+"*ssN":
         "min(1,max(0,"+original+"*iif(ssV>1e-8,ssN/max(1e-8,ssV),1)))");
   };

   // Verify the native result against the actual JavaScript AS function, not
   // against a second independently approximated mathematical expression.
   // This catches channel mapping errors and accidental color shifts before
   // the source view is ever modified.
   this.validateNativeAS=function(src,nativeImage,strictPrecision)
   {
      var W=src.width,H=src.height,C=src.numberOfChannels;
      var strength=0.50*self.stretch_Control.value;
      var li=self.localIntensity_Control.value;
      var intensity=1.75*self.intensity_Control.value;
      var count=0,sum=0,maxErr=0,failed=0;
      console.writeln("[Smart Stretch Apply] Validation source channels="+C+
         ", native channels="+nativeImage.numberOfChannels);
      if(nativeImage.numberOfChannels!=C || nativeImage.width!=W || nativeImage.height!=H)
         throw new Error("Native validation input dimensions/channels mismatch");
      var nx=24,ny=16;
      for(var iy=0;iy<ny;++iy)
      {
         var y=Math.min(H-1,Math.floor((iy+0.5)*H/ny));
         for(var ix=0;ix<nx;++ix)
         {
            var x=Math.min(W-1,Math.floor((ix+0.5)*W/nx));
            var signal=self.signalValueAt(src,x,y);
            var transformed=symmetryPointStretchValue(signal,strength,self.committedSP,li,self.stretchFocus);
            var target=Math.max(0,Math.min(1,transformed+intensity*0.5));
            target=signal+tonalProtectionFactor(signal,self.protectShadows_Control.value,
               self.protectHighlights_Control.value)*(target-signal);
            var scale=signal>1.0e-8?target/signal:1;
            for(var ch=0;ch<C;++ch)
            {
               var old=src.sample(x,y,ch),expected;
               if(C<3)expected=target;
               else if(self.channelMode=="R"||self.channelMode=="G"||self.channelMode=="B")
               {
                  var selected=self.channelMode=="R"?0:self.channelMode=="G"?1:2;
                  expected=ch==selected?target:old;
               }
               else expected=Math.max(0,Math.min(1,old*scale));
               var actual=nativeImage.sample(x,y,ch);
               var err=Math.abs(actual-expected);
               if(!isFinite(err))err=1;
               sum+=err;count++;
               if(err>maxErr)maxErr=err;
               if(err>0.002)failed++;
            }
         }
      }
      var mean=sum/Math.max(1,count);
      console.writeln("[Smart Stretch Apply] Native AS validation: samples="+count+
         " | mean abs error="+mean.toFixed(7)+
         " | max abs error="+maxErr.toFixed(7)+
         " | errors > 0.002="+failed);
      if(strictPrecision && (maxErr>0.00002 || mean>0.000002))
         throw new Error("32-bit candidate failed strict precision checks (max="+maxErr+", mean="+mean+")");
      if(maxErr>0.002 || mean>0.0005)
         throw new Error("Native AS output differs from JavaScript reference; rejecting native image (max error="+
            maxErr.toFixed(6)+")");
   };

   // Full-channel preflight on a small, representative RGB image.
   // This is independent of the sparse full-image validation and catches
   // channel-order, channel-reference and color-preservation errors BEFORE
   // the costly full-resolution PixelMath execution.
   this.preflightNativeAS=function(source,profile)
   {
      var t0=new Date().getTime();
      var W=64,H=64,C=source.numberOfChannels;
      // Image(W,H,C) does not reliably establish RGB color space in PJSR.
      // Allocate the probe through an explicit RGB ImageWindow instead.
      var probeWindow=new ImageWindow(W,H,C,32,true,C==3,"SmartStretch_Preflight");
      var probe=probeWindow.mainView.image;
      var nativeProbe=null,reference=null;
      var probeTransactionOpen=false;
      var preflightStage="initialize";
      try
      {
         preflightStage="begin probe image transaction";
         console.writeln("[Smart Stretch Apply] Preflight stage: "+preflightStage);
         SmartTools.beginPrivateProcess(probeWindow.mainView);
         probeTransactionOpen=true;
         preflightStage="populate probe RGB pixels";
         for(var y=0;y<H;++y)
         {
            var sy=Math.min(source.height-1,Math.floor((y+0.5)*source.height/H));
            for(var x=0;x<W;++x)
            {
               var sx=Math.min(source.width-1,Math.floor((x+0.5)*source.width/W));
               for(var c=0;c<C;++c)
                  probe.setSample(source.sample(sx,sy,c),x,y,c);
            }
         }
         preflightStage="end probe image transaction";
         probeWindow.mainView.endProcess();
         probeTransactionOpen=false;
         console.writeln("[Smart Stretch Apply] Preflight stage: "+preflightStage+" complete");
         console.writeln("[Smart Stretch Apply] Native preflight: "+
            W+" x "+H+" x "+C+"; comparing EVERY channel against JavaScript");
         console.writeln("[Smart Stretch Apply] Preflight source channels="+
            source.numberOfChannels+", probe channels="+probe.numberOfChannels);
         if(probe.numberOfChannels!=C)
            throw new Error("Preflight probe channel mismatch: expected "+C+
               ", got "+probe.numberOfChannels);
         preflightStage="JavaScript reference transform";
         console.writeln("[Smart Stretch Apply] Preflight stage: "+preflightStage);
         self.exactReferencePass=true;
         try{reference=self.processFullResolution(probe,true);}
         finally{self.exactReferencePass=false;}
         console.writeln("[Smart Stretch Apply] Preflight JS reference: "+
            reference.width+" x "+reference.height+" x "+reference.numberOfChannels);
         if(reference.numberOfChannels!=C || reference.width!=W || reference.height!=H)
            throw new Error("Preflight JavaScript reference dimensions/channels mismatch");
         preflightStage="native PixelMath transform";
         console.writeln("[Smart Stretch Apply] Preflight stage: "+preflightStage);
         nativeProbe=self.processNativeAS(probe,profile,false);
         console.writeln("[Smart Stretch Apply] Preflight native result: "+
            nativeProbe.width+" x "+nativeProbe.height+" x "+nativeProbe.numberOfChannels);
         if(nativeProbe.numberOfChannels!=C || nativeProbe.width!=W || nativeProbe.height!=H)
            throw new Error("Preflight native result dimensions/channels mismatch");
         preflightStage="compare per-channel pixels";
         console.writeln("[Smart Stretch Apply] Preflight stage: "+preflightStage);
         var maxErr=[0,0,0],sum=[0,0,0],n=W*H;
         for(var yy=0;yy<H;++yy)
            for(var xx=0;xx<W;++xx)
               for(var cc=0;cc<C;++cc)
               {
                  var a=reference.sample(xx,yy,cc);
                  var b=nativeProbe.sample(xx,yy,cc);
                  var err=Math.abs(a-b);
                  if(!isFinite(err))err=1;
                  sum[cc]+=err;
                  if(err>maxErr[cc])maxErr[cc]=err;
               }
         for(var ch=0;ch<C;++ch)
            console.writeln("[Smart Stretch Apply] Native preflight channel "+
               (ch==0?"R":ch==1?"G":"B")+
               ": mean="+(sum[ch]/n).toFixed(8)+
               ", max="+maxErr[ch].toFixed(8));
         self.logApplyStage("Native: 64x64 full-channel preflight",t0);
         for(var j=0;j<C;++j)
            if(maxErr[j]>0.001 || sum[j]/n>0.0002 ||
               (profile && profile.bits==32 && (maxErr[j]>0.00002 || sum[j]/n>0.000002)))
               throw new Error("Native AS failed full-channel preflight on "+
                  (j==0?"red":j==1?"green":"blue")+
                  " channel; refusing native full-resolution Apply");
         console.writeln("[Smart Stretch Apply] Native preflight PASSED");
         return true;
      }
      catch(preflightError)
      {
         console.warningln("[Smart Stretch Apply] Preflight FAILED at stage: "+preflightStage+
            " | "+preflightError);
         throw preflightError;
      }
      finally
      {
         if(probeTransactionOpen)
         {
            try{probeWindow.mainView.endProcess();}
            catch(closeError)
            {console.warningln("[Smart Stretch Apply] Preflight transaction cleanup: "+closeError);}
         }
         if(nativeProbe!=null)nativeProbe.free();
         if(reference!=null)reference.free();
         probeWindow.forceClose();
      }
   };

   this.processNativeAS=function(src,profile,borrowOutput)
   {
      profile=profile||{bits:64,lut:false};
      var W=src.width,H=src.height,C=src.numberOfChannels;
      var bits=profile.bits,context=self.nativeContext;
      var table=null;
      if(profile.kind && profile.kind!="exact"){
         if(!context)throw new Error("Native LUT context is unavailable");
         table=self.ensureNativeTable(context,profile.kind);
         if(!table)throw new Error("Native LUT candidate failed interpolation checks: "+profile.kind);
      }else if(!profile.kind && profile.lut)
         table=context?self.ensureNativeTable(context,"nonuniform"):self.prepareNativeTable();
      var pool=borrowOutput?(self.nativeWorkspace||(self.nativeWorkspace={})):{};

      var t0=SmartTools.now(),temp=null,gainWindow=null,complete=false;
      try
      {
         self.reportApplicationProgress(12,"Preparing native PixelMath image…");
         // Preserve 64-bit input samples, even for a 32-bit working candidate.
         var sourceBits=src.bitsPerSample==64?64:32;
         temp=SmartTools.acquireWindow(pool,"NativeTemp",W,H,C,sourceBits,C==3);
         if(!borrowOutput || self.nativePreparedSource!==src){
            SmartTools.beginPrivateProcess(temp.mainView);
            try{temp.mainView.image.assign(src);temp.mainView.image.resetSelections();}
            finally{temp.mainView.endProcess();}
         }
         if(borrowOutput)self.nativePreparedSource=null;
         self.logApplyStage("Native: source copy / workspace reuse",t0);
         if(table)
         {
            // LUT domain is [0,1]. Native extrema check covers the ENTIRE input,
            // unlike sample-grid validation. Do not change out-of-range behavior.
            var rangeStart=SmartTools.now(),lo=context?context.low:1,hi=context?context.high:0;
            if(!context){
               for(var cc=0;cc<C;++cc){
                  temp.mainView.image.selectedChannel=cc;
                  lo=Math.min(lo,temp.mainView.image.minimum());
                  hi=Math.max(hi,temp.mainView.image.maximum());
               }
               temp.mainView.image.resetSelections();
            }
            self.logApplyStage("Native: LUT-domain check / reuse",rangeStart);
            if(!isFinite(lo)||!isFinite(hi)||lo<0||hi>1)
               throw new Error("Input outside native LUT domain; retry exact curve");
            var uploadStart=SmartTools.now();
            var lutWindow=SmartTools.acquireWindow(pool,"StretchLUT",table.cells+1,1,1,64,false);
            var lutKey=table.key || self.nativeTableCache.key;
            if(!pool.StretchLUT.hasOwnProperty("tableKey") || pool.StretchLUT.tableKey!=lutKey){
               SmartTools.beginPrivateProcess(lutWindow.mainView);
               try{lutWindow.mainView.image.setSamples(table.values);}
               finally{lutWindow.mainView.endProcess();}
               pool.StretchLUT.tableKey=lutKey;
            }
            self.logApplyStage("Native: LUT upload / reuse",uploadStart);
         }
         var expression=function(channel){return table?
            self.nativeLUTExpression(src,channel,pool.StretchLUT.window.mainView.id,table):
            self.nativeASExpression(src,channel);};
         var symbols="ssV,ssP,ssZ,ssC,ssD,ssN,ssI";
         var sharedGain=!profile.direct && C==3 && self.channelMode!="R" && self.channelMode!="G" && self.channelMode!="B";
         console.writeln("[Smart Stretch Apply] Native profile: "+(table?"LUT / "+(profile.kind || "nonuniform"):"exact")+
            " | working="+bits+"-bit | output="+sourceBits+"-bit | combined="+!!profile.fused+" | pooled="+!!borrowOutput);
         if(sharedGain && profile.fused)
         {
            var fusedStart=SmartTools.now();
            var fusedExpression=expression(0);
            var scalarPrefix=fusedExpression.substring(0,fusedExpression.lastIndexOf(";")+1);
            var fusedProcess=SmartTools.configurePixelMath(new PixelMath,bits);
            fusedProcess.symbols=symbols;fusedProcess.useSingleExpression=true;
            // Explicit channel references yield a scalar signal/target; $T in
            // the final expression is the RGB vector. Calculate once, apply
            // to all three components in one combined RGB/K native pass.
            // PixelMath's final truncate already clamps every RGB component.
            fusedProcess.expression=scalarPrefix+(table && table.gain?"$T*ssN":
               "$T*iif(ssV>1e-8,ssN/max(1e-8,ssV),1)");
            self.reportApplicationProgress(35,"Applying combined native RGB stretch…");
            if(!fusedProcess.executeOn(temp.mainView,false))throw new Error("Combined RGB stretch failed");

            self.logApplyStage(table?"Native: combined RGB LUT pass":"Native: combined RGB exact pass",fusedStart);
         }
         else if(sharedGain)
         {
            var gainStart=SmartTools.now();
            // Preserve intermediate gain precision; gain may exceed one.
            gainWindow=SmartTools.acquireWindow(pool,"GainTemp",W,H,1,64,false);
            var fullExpression=expression(0);
            var scalarCode=fullExpression.substring(0,fullExpression.lastIndexOf(";")+1);
            scalarCode=scalarCode.replace(/\$T/g,temp.mainView.id);
            var gainProcess=SmartTools.configurePixelMath(new PixelMath,bits);
            gainProcess.symbols=symbols;gainProcess.useSingleExpression=true;
            gainProcess.expression=scalarCode+(table && table.gain?"ssN":"iif(ssV>1e-8,ssN/max(1e-8,ssV),1)");
            gainProcess.truncate=false; // gain must be allowed above one
            self.reportApplicationProgress(30,"Calculating shared RGB gain…");
            if(!gainProcess.executeOn(gainWindow.mainView,false))throw new Error("Shared gain calculation failed");

            self.logApplyStage(table?"Native: LUT grayscale gain":"Native: nonlinear curve once (grayscale gain)",gainStart);
            var multiplyStart=SmartTools.now();
            var rgbProcess=SmartTools.configurePixelMath(new PixelMath,bits);
            rgbProcess.useSingleExpression=true;
            rgbProcess.expression="$T*"+gainWindow.mainView.id;
            self.reportApplicationProgress(65,"Applying shared gain to RGB…");
            if(!rgbProcess.executeOn(temp.mainView,false))throw new Error("Shared gain RGB multiply failed");

            self.logApplyStage("Native: simple RGB multiplication",multiplyStart);
            self.logApplyStage("Native: grayscale gain plus RGB total",gainStart);
         }
         else
         {
            var p=SmartTools.configurePixelMath(new PixelMath,bits);
            p.symbols=symbols;p.useSingleExpression=C==1;
            p.expression=expression(0);
            if(C==3){p.expression1=expression(1);p.expression2=expression(2);}
            var executionStart=SmartTools.now();
            if(!p.executeOn(temp.mainView,false))throw new Error("PixelMath executeOn returned false");

            self.logApplyStage(table?"Native: LUT PixelMath execution":"Native: PixelMath execution",executionStart);
         }
         var nativeImage=temp.mainView.image;
         if(nativeImage.numberOfChannels!=C || nativeImage.width!=W || nativeImage.height!=H)
            throw new Error("Native output image dimensions/channels mismatch");
         var validationStart=SmartTools.now();
         self.validateNativeAS(src,nativeImage,bits==32);
         self.logApplyStage("Native: numerical validation",validationStart);
         if(borrowOutput){
            // Keep the private output alive until Apply validates and commits.
            // No detached full-resolution Image allocation/copy is needed.
            self.nativeResultWindow=temp;complete=true;
            return nativeImage;
         }
         var result=new Image(nativeImage);complete=true;return result;
      }
      finally
      {
         if(!borrowOutput || !complete)SmartTools.closeWindowPool(pool);
         if(borrowOutput && !complete)self.nativeResultWindow=null;
      }
   };


   this.processFullResolution = function(src,quickAlreadyApplied)
   {
      // This pass always uses the current full-resolution external base, never
      // the reduced working preview. It intentionally uses no 2x2 drag shortcut.
      var W=src.width,H=src.height,C=src.numberOfChannels;
      var timingStart=new Date().getTime();
      var stageStart=timingStart;
      // Source is read-only; only Quick Stretch needs a separate base buffer.
      var applyQuick=self.basicStretchEnabled && !quickAlreadyApplied;
      var base=src;
      self.logApplyStage("Copy source to working buffer",stageStart);
      stageStart=new Date().getTime();
      var result=null;
      var mask=null,localMean=null,boundary=null;
      var pm=self.processingMask,pr=self.processingRangeWidth;
      var needsSelection=self.selectionMode!="symmetry" || self.smartMask!=null;
      var needFullMask=needsSelection &&
         (self.hdrEnable_CheckBox.checked || self.adaptiveBoundary_Control.value>0);
      var maskWidth=pm!=null ? pm.width : 0;
      var maskHeight=pm!=null ? pm.height : 0;
      var rangeWidth=pr!=null ? pr.width : 0;
      var rangeHeight=pr!=null ? pr.height : 0;
      var maskXScale=maskWidth/W,maskYScale=maskHeight/H;
      var rangeXScale=rangeWidth/W,rangeYScale=rangeHeight/H;
      console.writeln("[Smart Stretch Apply] Fast path: full mask="+
         (needFullMask?"required for HDR/boundary":"not needed")+
         ", full range=eliminated, direct reduced-resolution lookup=enabled");
      var maskData=pm==null?null:self.getPreviewPlane(pm,"R","maskPlaneCache");
      var rangeData=pr==null?null:self.getPreviewPlane(pr,"R","rangePlaneCache");
      var intensity=1.75*self.intensity_Control.value;
      var contrast=self.contrast_Control.value;
      var stretch=0.50*self.stretch_Control.value;
      var li=self.localIntensity_Control.value;
      var curve=self.getStretchEvaluator(stretch,self.committedSP,li,self.selectionMode=="symmetry");
      var localGain=Math.pow(2,contrast)-1;
      var shadows=self.protectShadows_Control.value;
      var highlights=self.protectHighlights_Control.value;
      try
      {
         // Quick Stretch changes the PREVIEW base. Replicate that exact
         // baseline transform at full resolution before applying AS.
         if(applyQuick)
         {
            var nativeQuickOK=false;
            // Reference/preflight retains the original JavaScript equations.
            if(!self.quickAnalysisRecipe && !self.exactReferencePass && src.isReal!==false && typeof PixelMath!="undefined" && (C==1||C==3))
               try{base=self.processNativeQuick(src,false);nativeQuickOK=true;}
               catch(quickError){console.warningln("[Smart Stretch Apply] Native Quick baseline rejected; using exact JavaScript: "+quickError);}
            if(self.quickAnalysisRecipe){base=self.quickFaintPass(src);nativeQuickOK=true;
               if(self.basicStretchLinearEnabled){var al=self.quickLinearPass(base);base.free();base=al;}
               if(self.quickNebulosityEnabled){var an=self.quickNebulosityPass(base,self.quickNebulosityStrength,false,true);base.free();base=an;}}
            if(!nativeQuickOK)
            {
               base=new Image(src);
               for(var qy=0;qy<H;++qy)
               {
                  if((qy&31)==0)
                     self.reportApplicationProgress(2+10*qy/H,
                        "Applying Quick Stretch baseline…");
                  for(var qx=0;qx<W;++qx)
                  {
                     var qLum=C<3 ? src.sample(qx,qy,0) :
                        (0.2126*src.sample(qx,qy,0)+
                         0.7152*src.sample(qx,qy,1)+
                         0.0722*src.sample(qx,qy,2));
                     var denom=Math.max(1.0e-8,1-self.basicStretchBlack);
                     var norm=Math.max(0,(qLum-self.basicStretchBlack)/denom);
                     var qNew=basicStretchCurve(norm,self.basicStretchGain,
                        self.basicStretchShoulder,self.basicStretchShoulderStrength);
                     if(C<3)base.setSample(qNew,qx,qy,0);
                     else
                     {
                        var ratio=qLum>1.0e-8 ? qNew/qLum : 1;
                        for(var qc=0;qc<Math.min(3,C);++qc)
                           base.setSample(Math.max(0,Math.min(1,
                              src.sample(qx,qy,qc)*ratio)),qx,qy,qc);
                     }
                  }
               }
            }
         }
         if(applyQuick&&!nativeQuickOK&&self.basicStretchFaintEnabled){var faintBase=self.quickFaintPass(src);base.free();base=faintBase;}
         if(applyQuick&&!nativeQuickOK&&self.basicStretchLinearEnabled){var linearBase=self.quickLinearPass(base);base.free();base=linearBase;}
         if(applyQuick&&!nativeQuickOK&&self.quickNebulosityEnabled){var nebulaBase=self.quickNebulosityPass(base,self.quickNebulosityStrength,false,true);base.free();base=nebulaBase;}
         self.logApplyStage("Quick Stretch baseline"+(applyQuick?"":quickAlreadyApplied&&self.basicStretchEnabled?" (already applied natively)":" (skipped)"),stageStart);
         stageStart=new Date().getTime();
         self.reportApplicationProgress(12,"Preparing stretch selection…");
         result=new Image(base);
         if(needFullMask)
         {
            // Only HDR and adaptive-boundary processing require a full-sized
            // mask. The main pixel transform samples the reduced mask directly.
            mask=new Image(W,H,1);
            for(var my=0;my<H;++my)
            {
               if((my&63)==0)
                  self.reportApplicationProgress(12+10*my/H,
                     "Preparing boundary/HDR mask…");
               var py=maskHeight>0 ? Math.min(maskHeight-1,
                  Math.floor(my*maskYScale)) : 0;
               for(var mx=0;mx<W;++mx)
               {
                  var px=maskWidth>0 ? Math.min(maskWidth-1,
                     Math.floor(mx*maskXScale)) : 0;
                  mask.setSample(pm!=null ? maskData[py*maskWidth+px] : 0,mx,my,0);
               }
            }
         }
         self.logApplyStage("Output buffer and optional HDR/boundary mask",stageStart);
         stageStart=new Date().getTime();
         if(Math.abs(contrast)>1.0e-8)
         {
            self.reportApplicationProgress(23,"Calculating local contrast…");
            localMean=self.buildLocalSignalMean(base,14);
         }
         self.logApplyStage("Local contrast preparation"+(Math.abs(contrast)>1.0e-8?"":" (skipped)"),stageStart);
         stageStart=new Date().getTime();
         self.reportApplicationProgress(28,"Applying full-resolution stretch…");
         for(var y=0;y<H;++y)
         {
            if((y&31)==0)
               self.reportApplicationProgress(28+52*y/H,
                  "Applying full-resolution stretch…");
            var py=maskHeight>0 ? Math.min(maskHeight-1,
               Math.floor(y*maskYScale)) : 0;
            var ry=rangeHeight>0 ? Math.min(rangeHeight-1,
               Math.floor(y*rangeYScale)) : 0;
            for(var x=0;x<W;++x)
            {
               var mv=needsSelection ? (pm!=null ? maskData[py*maskWidth+Math.min(maskWidth-1,Math.floor(x*maskXScale))] : 0) : 1.0;
               if(mv<=1.0e-8)continue;
               var r,g,b,signal;
               if(C>=3){
                  r=base.sample(x,y,0);g=base.sample(x,y,1);b=base.sample(x,y,2);
                  signal=self.channelMode=="R"?r:self.channelMode=="G"?g:self.channelMode=="B"?b:
                     0.2126*r+0.7152*g+0.0722*b;
               }else signal=base.sample(x,y,0);
               var transformed=curve(signal);
               var detail=localMean!=null ? signal-localMean.sample(x,y,0) : 0;
               var rw=needsSelection ? (pr!=null ? rangeData[ry*rangeWidth+Math.min(rangeWidth-1,Math.floor(x*rangeXScale))] :
                  2*self.clickHalfWidth) : 1.0;
               var target=Math.max(0,Math.min(1,transformed+localGain*detail+
                  intensity*rw*0.5));
               var nv=signal+mv*tonalProtectionFactor(signal,shadows,highlights)*
                  (target-signal);
               if(C<3)result.setSample(nv,x,y,0);
               else if(self.channelMode=="R")result.setSample(nv,x,y,0);
               else if(self.channelMode=="G")result.setSample(nv,x,y,1);
               else if(self.channelMode=="B")result.setSample(nv,x,y,2);
               else
               {
                  var scale=signal>1.0e-8 ? nv/signal : 1;
                  result.setSample(Math.max(0,Math.min(1,r*scale)),x,y,0);
                  result.setSample(Math.max(0,Math.min(1,g*scale)),x,y,1);
                  result.setSample(Math.max(0,Math.min(1,b*scale)),x,y,2);
               }
            }
         }
         self.logApplyStage("Full-resolution pixel transformation",stageStart);
         stageStart=new Date().getTime();
         if(self.hdrEnable_CheckBox.checked)
         {
            // originalFullImage is never overwritten by Apply.
            self.reportApplicationProgress(82,"Recovering highlights and color (HDR)…");
            var hdr=self.applyReferenceAwareHDR(result,
               self.hdrStrength_Control.value,self.hdrScale_Control.value,
               self.originalFullImage,mask);
            if(hdr.image!==result)result.free();
            result=hdr.image;
         }
         self.logApplyStage("HDR recovery"+(self.hdrEnable_CheckBox.checked?"":" (skipped)"),stageStart);
         stageStart=new Date().getTime();
         if(mask!=null && self.adaptiveBoundary_Control.value>0)
         {
            self.reportApplicationProgress(88,"Evaluating adaptive boundary…");
            boundary=self.buildAdaptiveBoundarySafety(base,result,
               self.adaptiveBoundary_Control.value,mask);
            if(boundary!=null && self.adaptiveBoundaryTriggered)
               for(var by=0;by<H;++by)
               {
                  if((by&31)==0)
                     self.reportApplicationProgress(90+4*by/H,
                        "Blending protected boundaries…");
                  for(var bx=0;bx<W;++bx)
                  {
                     var bs=boundary.sample(bx,by,0);
                     if(bs>=0.999)continue;
                     for(var bc=0;bc<C;++bc)
                     {
                        var before=base.sample(bx,by,bc);
                        result.setSample(before+bs*(result.sample(bx,by,bc)-before),
                           bx,by,bc);
                     }
                  }
               }
         }
         self.logApplyStage("Adaptive boundary"+(mask!=null?"":" (skipped)"),stageStart);
         self.reportApplicationProgress(95,"Writing result to PixInsight…");
         return result;
      }
      catch(e)
      {
         if(result!=null)result.free();
         throw e;
      }
      finally
      {
         if(base!=null && base!==src)base.free();
         if(mask!=null)mask.free();
         
         if(localMean!=null)localMean.free();
         if(boundary!=null)boundary.free();
      }
   };

   this.setApplicationControlsEnabled = function( enabled )
   {
      var names = [
         "preview","histogram","before_CheckBox","preview_Button",
         "basicStretch_Button","autoHighContrast_Button","autoColorBrightness_Button","zoomToPeak_Button","centerSP_Button","resetHistogramZoom_Button",
         "rgbkChannel_Radio","rChannel_Radio","gChannel_Radio","bChannel_Radio",
         "symmetryMode_Radio","signalMode_Radio","colorMode_Radio","lowContrastMode_Radio","lowContrastSensitivity_Control","lowContrastScale_Control",
         "colorTolerance_Control","connectedColor_CheckBox","faintColorReach_Control","low_Control","high_Control",
         "width_Control","stretch_Control","intensity_Control",
         "contrast_Control","localIntensity_Control","stretchFocus_Control",
         "protectShadows_Control","protectHighlights_Control",
         "adaptiveBoundary_Control","hdrEnable_CheckBox",
         "hdrStrength_Control","hdrScale_Control",
         "overlay_CheckBox","inverseSelection_CheckBox","overlayStrength_Control",
         "lassoEnable_CheckBox","lassoSubtract_Radio","lassoKeep_Radio",
         "lassoClear_Button","commitSP_Button",
         "undo_Button","redo_Button","resetStretch_Button",
          "resetAll_Button","newInstance_Button","smartMask_Button","apply_Button","close_Button","dirtyApply_CheckBox","dirtyVerify_CheckBox"
      ];
      for ( var i = 0; i < names.length; ++i )
         if ( self[names[i]] != null )
            self[names[i]].enabled = enabled;
      self.stretchFocus_Control.enabled=enabled && (self.selectionMode=="symmetry"||self.selectionMode=="signal");
      self.lowContrastSensitivity_Control.enabled=enabled&&self.selectionMode=="lowcontrast";self.lowContrastScale_Control.enabled=enabled&&self.selectionMode=="lowcontrast";
      if(enabled&&self.selectionMode=="lowcontrast"){self.low_Control.enabled=false;self.high_Control.enabled=false;self.width_Control.enabled=false;self.colorTolerance_Control.enabled=false;}
   };

   this.reportApplicationProgress = function( percent, stage )
   {
      if(self.busyDialog==null)return;
      var p=Math.max(0,Math.min(100,Math.floor(percent)));
      if(self.lastApplicationPercent==p &&
         self.lastApplicationStage==stage)return;
      self.lastApplicationPercent=p;
      self.lastApplicationStage=stage;
      self.busyDialog.setProgress(p,stage);
      processEvents();
   };

   this.showApplicationBusyDialog = function( message )
   {
      if ( self.busyDialog == null )
         self.busyDialog = new SmartStretchBusyDialog( self );
      if ( message != null && message.length > 0 )
         self.busyDialog.message_Label.text = message;
      self.lastApplicationPercent=-1;
      self.lastApplicationStage="";
      self.busyDialog.setProgress(0,"Preparing full-resolution image…");
      self.busyDialog.adjustToContents();
      self.busyDialog.show();
      processEvents();
   };

   this.hideApplicationBusyDialog = function()
   {
      if ( self.busyDialog != null )
      {
         self.busyDialog.hide();
         processEvents();
      }
   };

   this.logApplyStage = function( stage, startedAt )
   {
      var seconds=(new Date().getTime()-startedAt)/1000;
      console.writeln("[Smart Stretch Apply] " + stage + ": " +
         seconds.toFixed(2) + " s");
   };

   // Experimental dirty Apply: support comes from the processing mask, never display pixels.
   this.dirtyReadRect=function(image,rect,ch){var a=[];image.getSamples(a,new Rect(rect.x0,rect.y0,rect.x1,rect.y1),ch);
      if(a.length!=(rect.x1-rect.x0)*(rect.y1-rect.y0))throw new Error("Dirty rectangle read geometry mismatch");return a;};
   this.dirtySignal=function(planes,index,C){if(C<3)return planes[0][index];
      return self.channelMode=="R"?planes[0][index]:self.channelMode=="G"?planes[1][index]:self.channelMode=="B"?planes[2][index]:.2126*planes[0][index]+.7152*planes[1][index]+.0722*planes[2][index];};
   this.buildDirtyApplyPlan=function(src){var t=SmartTools.now(),reason="",pm=self.processingMask;
      if(!self.dirtyApply_CheckBox.checked)reason="disabled";
      else if(src.isReal!==true||(src.bitsPerSample!=32&&src.bitsPerSample!=64)||(src.numberOfChannels!=1&&src.numberOfChannels!=3))reason="requires 32/64-bit floating-point mono/RGB";
      else if(typeof src.getSamples!="function"||typeof src.setSamples!="function")reason="bulk rectangle API unavailable";
      else if(self.basicStretchEnabled)reason="Quick Stretch changes the full baseline";
      else if(self.autoHighContrastEnabled)reason="Auto High Contrast can affect the full image";
      else if(self.autoColorBrightnessEnabled)reason="Auto Color & Brightness affects the full image";
      else if(self.hdrEnable_CheckBox.checked)reason="HDR requires the full-image reference path";
      else if(self.adaptiveBoundary_Control.value>0)reason="Adaptive Boundary requires the full-image path in this prototype";
      else if(self.selectionMode=="symmetry"&&self.smartMask==null)reason="unrestricted symmetry adjustment";
      else if(!pm)reason="no processing mask available";
      if(reason){console.writeln("[Smart Stretch Dirty] FALLBACK: "+reason);return {eligible:false,reason:reason};}
      var W=src.width,H=src.height,mw=pm.width,mh=pm.height,mask=SmartTools.readPlane(pm,0),dirty=new Array(mw*mh);
      if(mw<1||mh<1)throw new Error("Empty dirty mask geometry");
      var tileSize=128,cols=Math.ceil(W/tileSize),rows=Math.ceil(H/tileSize),flags=new Array(cols*rows),cells=0;
      for(var i=0;i<flags.length;i++)flags[i]=false;
      for(var y=0;y<mh;y++)for(var x=0;x<mw;x++){var index=y*mw+x,v=mask[index];if(!isFinite(v))throw new Error("Nonfinite selection weight");
         dirty[index]=v>1e-8?1:0;if(!dirty[index])continue;cells++;
         // Conservative floor/ceil bounds include every pixel used by the existing floor lookup.
         var x0=Math.max(0,Math.floor(x*W/mw)),x1=Math.min(W,Math.ceil((x+1)*W/mw));
         var y0=Math.max(0,Math.floor(y*H/mh)),y1=Math.min(H,Math.ceil((y+1)*H/mh));
         for(var ty=Math.floor(y0/tileSize);ty<Math.ceil(y1/tileSize);ty++)for(var tx=Math.floor(x0/tileSize);tx<Math.ceil(x1/tileSize);tx++)flags[ty*cols+tx]=true;
      }
      var rects=[],pixels=0;for(var ty=0;ty<rows;ty++)for(var tx=0;tx<cols;tx++)if(flags[ty*cols+tx]){
         var rect={x0:tx*tileSize,y0:ty*tileSize,x1:Math.min(W,(tx+1)*tileSize),y1:Math.min(H,(ty+1)*tileSize),key:ty*cols+tx};
         pixels+=(rect.x1-rect.x0)*(rect.y1-rect.y0);rects.push(rect);}
      var coverage=pixels/(W*H),samples=pixels*src.numberOfChannels;
      console.writeln("[Smart Stretch Dirty] Plan: "+SmartTools.elapsed(t)+"; mask="+mw+"x"+mh+"; dirty cells="+cells+"/"+dirty.length+"; tiles="+rects.length+"/"+flags.length+"; coverage="+(100*coverage).toFixed(2)+"%; halo="+(Math.abs(self.contrast_Control.value)>1e-8?14:0));
      if(coverage>.35||samples>4000000){reason=coverage>.35?"dirty tile coverage exceeds 35%":"patch budget exceeds 4 million channel samples";console.writeln("[Smart Stretch Dirty] FALLBACK: "+reason);return {eligible:false,reason:reason};}
      return {eligible:true,W:W,H:H,C:src.numberOfChannels,mw:mw,mh:mh,mask:mask,dirtyMask:dirty,rects:rects,cols:cols,tileSize:tileSize,coverage:coverage,pixels:pixels};
   };
   this.processDirtyApply=function(src,plan){var t=SmartTools.now(),patches=[],range=self.processingRangeWidth;
      var rd=range?SmartTools.readPlane(range,0):null,rw=range?range.width:0,rh=range?range.height:0;
      var strength=.5*self.stretch_Control.value,li=self.localIntensity_Control.value,symmetry=self.selectionMode=="symmetry";
      var curve=self.getStretchEvaluator(strength,self.committedSP,li,symmetry);
      var exact=function(v){return symmetry?symmetryPointStretchValue(v,strength,self.committedSP,li,self.stretchFocus):self.focusSignalValue(v,localizedStretchValue(v,strength,li));};
      var gain=Math.pow(2,self.contrast_Control.value)-1,halo=Math.abs(self.contrast_Control.value)>1e-8?14:0;
      var changed=0,evaluated=0,checks=0,maxError=0,readMS=0,transformMS=0;
      for(var tile=0;tile<plan.rects.length;tile++){
         if((tile&7)==0)self.reportApplicationProgress(12+70*tile/Math.max(1,plan.rects.length),"Processing dirty tiles…");
         var r=plan.rects[tile],w=r.x1-r.x0,h=r.y1-r.y0,sourceRect={x0:Math.max(0,r.x0-halo),y0:Math.max(0,r.y0-halo),x1:Math.min(plan.W,r.x1+halo),y1:Math.min(plan.H,r.y1+halo)};
         var sw=sourceRect.x1-sourceRect.x0,sh=sourceRect.y1-sourceRect.y0,planes=[],start=SmartTools.now();
         for(var c=0;c<plan.C;c++)planes.push(self.dirtyReadRect(src,sourceRect,c));readMS+=SmartTools.now()-start;start=SmartTools.now();
         var integral=null,stride=sw+1;if(halo){integral=new Array((sw+1)*(sh+1));for(var i=0;i<integral.length;i++)integral[i]=0;
            for(var sy=0;sy<sh;sy++){var sum=0;for(var sx=0;sx<sw;sx++){sum+=self.dirtySignal(planes,sy*sw+sx,plan.C);integral[(sy+1)*stride+sx+1]=integral[sy*stride+sx+1]+sum;}}}
         var before=[],after=[],patchChanged=false,tileChecks=0;for(var c=0;c<plan.C;c++){before.push(new Array(w*h));after.push(new Array(w*h));}
         for(var y=r.y0;y<r.y1;y++)for(var x=r.x0;x<r.x1;x++){
            var pi=(y-r.y0)*w+x-r.x0,si=(y-sourceRect.y0)*sw+x-sourceRect.x0;
            for(var c=0;c<plan.C;c++)before[c][pi]=after[c][pi]=planes[c][si];
            var mx=Math.min(plan.mw-1,Math.floor(x*plan.mw/plan.W)),my=Math.min(plan.mh-1,Math.floor(y*plan.mh/plan.H)),weight=plan.mask[my*plan.mw+mx];
            if(weight<=1e-8)continue;evaluated++;
            var signal=self.dirtySignal(planes,si,plan.C),mean=signal;
            if(halo){var x0=Math.max(0,x-14)-sourceRect.x0,x1=Math.min(plan.W,x+15)-sourceRect.x0,y0=Math.max(0,y-14)-sourceRect.y0,y1=Math.min(plan.H,y+15)-sourceRect.y0;
               mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));}
            var width=rd?rd[Math.min(rh-1,Math.floor(y*rh/plan.H))*rw+Math.min(rw-1,Math.floor(x*rw/plan.W))]:2*self.clickHalfWidth;
            var addition=gain*(signal-mean)+.875*self.intensity_Control.value*width;
            var protection=tonalProtectionFactor(signal,self.protectShadows_Control.value,self.protectHighlights_Control.value);
            var target=SmartTools.clamp(curve(signal)+addition,0,1),nv=signal+weight*protection*(target-signal);
            var selected={R:0,G:1,B:2}[self.channelMode],scale=signal>1e-8?nv/signal:1;
            for(var c=0;c<plan.C;c++){var v=plan.C==1?nv:selected!=null?(selected==c?nv:before[c][pi]):SmartTools.clamp(before[c][pi]*scale,0,1);
               if(!isFinite(v))throw new Error("Nonfinite dirty output");after[c][pi]=v;if(v!==before[c][pi]){patchChanged=true;changed++;}}
            // Independent original equations; sample within every dirty tile.
            if(tileChecks==0||(pi%97)==0||pi==w*h-1){tileChecks++;var exactTarget=SmartTools.clamp(exact(signal)+addition,0,1),en=signal+weight*protection*(exactTarget-signal);
               for(var c=0;c<plan.C;c++){var expected=plan.C==1?en:selected!=null?(selected==c?en:before[c][pi]):SmartTools.clamp(before[c][pi]*(signal>1e-8?en/signal:1),0,1);
                  var error=Math.abs(after[c][pi]-expected);maxError=Math.max(maxError,error);checks++;if(error>3e-7)throw new Error("Dirty tile reference mismatch");}}
         }
         if(patchChanged)patches.push({rect:r,before:before,data:after});transformMS+=SmartTools.now()-start;
      }
      console.writeln("[Smart Stretch Dirty] Compute: read="+(readMS/1000).toFixed(3)+" s; transform="+(transformMS/1000).toFixed(3)+" s; total="+SmartTools.elapsed(t)+"; evaluated="+evaluated+"; changed channel samples="+changed+"; changed tiles="+patches.length+"; reference samples="+checks+"; max error="+maxError);
      var output={plan:plan,patches:patches,evaluated:evaluated,changed:changed,maxError:maxError};
      if(self.dirtyVerify_CheckBox.checked)self.verifyDirtyApply(src,output);
      return output;
   };
   this.verifyDirtyApply=function(src,output){var t=SmartTools.now(),reference=null,old=self.exactReferencePass,maxError=0,count=0;
      try{self.exactReferencePass=true;reference=self.processFullResolution(src);var byKey={};for(var p=0;p<output.patches.length;p++)byKey[output.patches[p].rect.key]=output.patches[p];
         var plan=output.plan;for(var y=0;y<plan.H;y+=plan.tileSize)for(var x=0;x<plan.W;x+=plan.tileSize){var rect={x0:x,y0:y,x1:Math.min(plan.W,x+plan.tileSize),y1:Math.min(plan.H,y+plan.tileSize)},patch=byKey[Math.floor(y/plan.tileSize)*plan.cols+Math.floor(x/plan.tileSize)];
            for(var c=0;c<plan.C;c++){var expected=self.dirtyReadRect(reference,rect,c),actual=patch?patch.data[c]:self.dirtyReadRect(src,rect,c);
               for(var i=0;i<expected.length;i++){var error=Math.abs(expected[i]-actual[i]);if(!isFinite(error))throw new Error("Nonfinite full dirty comparison");maxError=Math.max(maxError,error);count++;if(error>3e-7)throw new Error("Full-image dirty/reference mismatch");}}}
         console.writeln("[Smart Stretch Dirty] FULL verification: "+SmartTools.elapsed(t)+"; samples="+count+"; max error="+maxError+"; clean and dirty tiles checked");
      }finally{self.exactReferencePass=old;if(reference)reference.free();}
   };
   this.writeDirtyApply=function(target,output){var t=SmartTools.now(),patches=output.patches;
      // Confirm source data has not changed between preparation and the transaction.
      for(var p=0;p<patches.length;p++)for(var c=0;c<output.plan.C;c++){var live=self.dirtyReadRect(target.image,patches[p].rect,c),before=patches[p].before[c];for(var i=0;i<live.length;i++)if(live[i]!==before[i])throw new Error("Source changed during dirty Apply; reload and retry");}
      var touched=[];try{for(var p=0;p<patches.length;p++){var patch=patches[p],r=patch.rect;touched.push(patch);
            for(var c=0;c<output.plan.C;c++)target.image.setSamples(patch.data[c],new Rect(r.x0,r.y0,r.x1,r.y1),c);}}
      catch(e){var rollbackOK=true;for(var p=0;p<touched.length;p++){var patch=touched[p],r=patch.rect;for(var c=0;c<output.plan.C;c++)try{target.image.setSamples(patch.before[c],new Rect(r.x0,r.y0,r.x1,r.y1),c);}catch(rollbackError){rollbackOK=false;}}
         console.warningln("[Smart Stretch Dirty] Write failed; rollback="+(rollbackOK?"complete":"FAILED — use PixInsight Undo"));throw e;}
      console.writeln("[Smart Stretch Dirty] Rectangle write: "+SmartTools.elapsed(t)+"; tiles="+patches.length+"; whole-image assign skipped");
   };

   this.applyToExternalImage = function()
   {
      if(self.applicationInProgress || self.activeView==null || self.activeView.isNull)
         return;
      self.applicationInProgress=true;
      var applyStart=new Date().getTime();
      var stageStart=applyStart;
      console.show();
      console.writeln("\n[Smart Stretch Apply] BEGIN | v"+VERSION+
         " | view="+self.activeView.id+
         " | " + self.activeView.image.width + " x " +
         self.activeView.image.height + " x " +
         self.activeView.image.numberOfChannels + " channels" +
         " | mode="+self.selectionMode+
         " | focus="+self.stretchFocus+" | stretch="+self.stretch_Control.value.toFixed(3)+
         " | contrast="+self.contrast_Control.value.toFixed(3)+
         " | HDR="+(self.hdrEnable_CheckBox.checked?"on":"off")+
         " | boundary="+self.adaptiveBoundary_Control.value.toFixed(3)+
         " | quick="+(self.basicStretchEnabled?(self.quickNebulosityEnabled?"STF + faint nebulosity":self.basicStretchFaintEnabled?"STF":"legacy"):"off")+
         " | mask="+(self.processingMask!=null?"yes":"no"));
      self.setApplicationControlsEnabled(false);
      self.status_Label.text="Updating image…";
      self.showApplicationBusyDialog(
         "<b>Updating image…</b><br/>Applying Smart Stretch to the full-resolution image. Please wait…");
      var result=null,resultOwned=true,started=false,success=false,dirtyOutput=null;
      var target=self.activeView;
      try
      {
         // Always process the currently attached view, with a true full-res
         // image copy; do not use processedPreviewBitmap / reduced pixels.
         var dirtyPlan=self.buildDirtyApplyPlan(target.image);
         if(dirtyPlan.eligible)try{dirtyOutput=self.processDirtyApply(target.image,dirtyPlan);}
         catch(dirtyError){console.warningln("[Smart Stretch Dirty] Preparation/verification rejected; full Apply fallback: "+dirtyError);dirtyOutput=null;}
         if(!dirtyOutput){
         var useNative=self.canUseNativeAS(target.image);
         console.writeln("[Smart Stretch Apply] Execution path: "+
            (useNative?"native PixelMath AS":"JavaScript fallback"));
         if(useNative)
         {
            try
            {
               var nativeSource=target.image;
               if(self.basicStretchEnabled){
                  self.reportApplicationProgress(2,"Applying exact native Quick Stretch baseline…");
                  nativeSource=self.processNativeQuick(target.image,true);
               }
               var context=self.prepareNativeContext(nativeSource);
               var profiles=self.nativeProfiles(context);
               for(var attempt=0;attempt<profiles.length;++attempt){
                  var profile=profiles[attempt];
                  // Reject an unsafe table before allocating/preparing a probe.
                  // Retain the prepared full-size source for the next candidate.
                  if(profile.kind!="exact" && !self.ensureNativeTable(context,profile.kind))continue;
                  var fullNativeStarted=false;
                  try{
                     self.preflightNativeAS(nativeSource,profile);
                     fullNativeStarted=true;
                     result=self.processNativeAS(nativeSource,profile,true);resultOwned=false;
                     break;
                  }catch(profileError){
                     console.warningln("[Smart Stretch Apply] Native candidate rejected ("+
                        self.nativeProfileName(profile)+", "+profile.bits+"-bit): "+profileError);
                     // Preflight owns a separate tiny workspace and cleans it
                     // itself. Keep the untouched full-size copy for retries.
                     if(fullNativeStarted){
                        SmartTools.closeWindowPool(self.nativeWorkspace);
                        self.nativePreparedSource=null;
                     }
                     self.nativeResultWindow=null;
                     if(attempt==profiles.length-1)throw profileError;
                  }
               }
            }
            catch(nativeError)
            {
               console.warningln("[Smart Stretch Apply] Native path failed: "+nativeError);
               console.writeln("[Smart Stretch Apply] Retrying with JavaScript fallback");
               result=self.processFullResolution(target.image);resultOwned=true;
            }
         }
         else{result=self.processFullResolution(target.image);resultOwned=true;}
         if(self.autoHighContrastEnabled){var replacement=self.replaceApplyResultWithContrast(result,resultOwned);result=replacement.image;resultOwned=replacement.owned;}
         if(self.autoColorBrightnessEnabled){var colorReplacement=self.replaceApplyResultWithAutoColor(result,resultOwned);result=colorReplacement.image;resultOwned=colorReplacement.owned;}
         }
         self.logApplyStage("Full-resolution processing incl. buffers",stageStart);
         stageStart=new Date().getTime();
         var beforeSummary=SmartTools.pixelSummary(target.image);
         var afterSummary=dirtyOutput?null:SmartTools.pixelSummary(result);
         console.writeln("[Smart Stretch Apply] RAW pixels before: min="+beforeSummary.minimum+
            " median="+beforeSummary.median+" max="+beforeSummary.maximum+
            " all-channel white="+(100*beforeSummary.whiteFraction).toFixed(3)+"%");
         if(afterSummary){
         console.writeln("[Smart Stretch Apply] RAW pixels after: min="+afterSummary.minimum+
            " median="+afterSummary.median+" max="+afterSummary.maximum+
            " all-channel white="+(100*afterSummary.whiteFraction).toFixed(3)+"% (384 sampled pixels)");
         }
         self.reportApplicationProgress(96,"Writing full-resolution image…");
         target.beginProcess();
         started=true;
         if(dirtyOutput)self.writeDirtyApply(target,dirtyOutput);else target.image.assign(result);
         target.endProcess();
         started=false;
         // The custom preview renders raw transformed pixels. The external
         // view must use identity STF to display that same committed result.
         try
         {
            self.lastAppliedSTF=target.stf;
            SmartTools.resetViewSTF(target);
            console.writeln("[Smart Stretch Apply] Display STF reset; committed pixels unchanged");
         }
         catch(stfError)
         {
            console.warningln("[Smart Stretch Apply] Could not reset display STF: "+stfError+
               "; disable STF manually to inspect raw pixels");
         }
         self.logApplyStage("PixInsight image transaction/write",stageStart);
         stageStart=new Date().getTime();
         self.reportApplicationProgress(98,"Refreshing Smart Stretch baseline…");

         // Keep controls locked until all session state has been rebuilt.
         var activeSP=self.committedSP;
         var oldMode=self.selectionMode;
         self.historyRestoring=true;
         try
         {
            self.stretch_Control.setValue(0);
            self.intensity_Control.setValue(0);
            self.contrast_Control.setValue(0);
            self.localIntensity_Control.setValue(0.5);
            self.protectShadows_Control.setValue(0);
            self.protectHighlights_Control.setValue(0);
            self.hdrEnable_CheckBox.checked=false;
            self.hdrStrength_Control.enabled=false;
            self.hdrScale_Control.enabled=false;
         }
         finally { self.historyRestoring=false; }
         self.invalidatePreviewCaches();
         if(!self.loadActiveView())
            throw new Error("Could not reload the updated image.");
         self.selectionMode=oldMode;
         self.symmetryMode_Radio.checked=oldMode=="symmetry";
         self.signalMode_Radio.checked=oldMode=="signal";
         self.colorMode_Radio.checked=oldMode=="color";
         self.lowContrastMode_Radio.checked=oldMode=="lowcontrast";
         if(oldMode=="symmetry")
         {
            self.committedSP=activeSP;
            self.pendingSP=activeSP;
            self.selections=[{type:"symmetry",center:activeSP,low:activeSP,
               high:activeSP,spatial:false,spatialMask:null}];
         }
         else
         {
            self.selections=[];
            self.samplePoints=[];
            self.rebuildProcessingMask();
         }
         self.syncSelectionUI();
         if(oldMode=="symmetry")self.autoPeakPendingSP(target.image);
         self.history=[];self.historyIndex=-1;self.commitHistory();
         self.logApplyStage("Refresh baseline and UI",stageStart);
         success=true;
         self.reportApplicationProgress(100,"Image updated successfully");
      }
      catch(e)
      {
         if(started)
            try { target.endProcess(); } catch(ignore){}
         self.status_Label.text="Apply failed: "+e;
         console.warningln("Smart Stretch full-resolution Apply failed: "+e);
      }
      finally
      {
         if(result!=null && resultOwned)result.free();
         dirtyOutput=null;
         self.nativeResultWindow=null;self.nativePreparedSource=null;
         SmartTools.closeWindowPool(self.nativeQuickWorkspace);SmartTools.closeWindowPool(self.nativeQuickFaintWorkspace);
         // Failed Apply must not retain a partially modified native workspace.
         if(!success)SmartTools.closeWindowPool(self.nativeWorkspace);
         var elapsed=(new Date().getTime()-applyStart)/1000;
         var megapixels=target.image.width*target.image.height/1000000;
         console.writeln("[Smart Stretch Apply] "+(success?"SUCCESS":"FAILED")+
            " | total="+elapsed.toFixed(2)+" s"+
            " | image="+megapixels.toFixed(2)+" MP"+
            " | throughput="+(megapixels/Math.max(0.001,elapsed)).toFixed(2)+" MP/s");
         self.hideApplicationBusyDialog();
         self.applicationInProgress=false;
         self.setApplicationControlsEnabled(true);
         self.syncSelectionUI();
         self.updateHistoryButtons();
      }
      if(success)
         self.status_Label.text="Applied full-resolution image — new stretch baseline ready";
   };

   this.previewNativePool={};this.previewNativeUses=0;this.previewHistogramTime=0;this.autoContrastCache=null;this.hdrMeanCache=null;this.boundaryGeometryCache=null;
   this.nativePreview=function(src,localMean,useSymmetry){var t=SmartTools.now(),pool=self.previewNativePool;
      function upload(im,name){var w=SmartTools.acquireWindow(pool,name,im.width,im.height,im.numberOfChannels,64,im.numberOfChannels==3);SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(im);}finally{w.mainView.endProcess();}return w;}
      if(src.numberOfChannels!=1&&src.numberOfChannels!=3)throw new Error("Native preview requires mono/RGB");
      if(self.previewNativeUses>=16){SmartTools.closeWindowPool(pool);self.previewNativeUses=0;}self.previewNativeUses=(self.previewNativeUses||0)+1;
      var w=upload(src,"PreviewResult"),mask=self.processingMask?upload(self.processingMask,"PreviewMask").mainView.id:null;
      var range=self.processingRangeWidth?upload(self.processingRangeWidth,"PreviewRange").mainView.id:null;
      var mean=localMean?upload(localMean,"PreviewMean").mainView.id:null;
      var n=function(v){return Number(v).toPrecision(17);},rgb=src.numberOfChannels==3,sel={R:0,G:1,B:2}[self.channelMode];
      var v=!rgb?"$T":sel!=null?"$T["+sel+"]":"(.2126*$T[0]+.7152*$T[1]+.0722*$T[2])";
      var sp=SmartTools.clamp(useSymmetry?self.selections[0].center:self.committedSP,.000001,.999999),li=SmartTools.clamp(self.localIntensity_Control.value,0,1);
      var strength=.5*self.stretch_Control.value,k=Math.pow(10,.75*strength)-1,den=k>=1e-8?Math.asinh(k):1;
      var base="ssV",code="ssV="+v+";";
      if(strength>0&&k>=1e-8){
         if(useSymmetry){code+="ssP=(ssV-"+n(sp)+")*iif(ssV<"+n(sp)+","+n(1/sp)+","+n(1/(1-sp))+");ssZ="+n(k)+"*abs(ssP);";
            base=n(sp)+"+iif(ssV<"+n(sp)+",-"+n(sp)+","+n(1-sp)+")*ln(ssZ+sqrt(1+ssZ*ssZ))/"+n(den);}
         else{code+="ssZ="+n(k)+"*ssV;";base="ln(ssZ+sqrt(1+ssZ*ssZ))/"+n(den);}
         code+="ssC="+base+";";
         if(Math.abs(li-.5)>=1e-8){code+="ssD="+(useSymmetry?"(min(1,max(-1,ssP))-"+n(2*li-1)+")/.70":"(ssV-"+n(li)+")/.22")+";ssC=ssV+("+(useSymmetry?".18+.82":".12+.88")+"*exp(-.5*ssD*ssD))*(ssC-ssV);";}
      }else code+="ssC=ssV;";
      if(useSymmetry||self.selectionMode=="signal")code+=self.nativeFocusCode(sp,!useSymmetry);
      var mv=mask?mask:(self.selectionMode=="symmetry"?"1":"0"),rw=self.selectionMode=="symmetry"?"1":range?range:n(2*self.clickHalfWidth);
      code+="ssN=min(1,max(0,ssC+"+(mean?n(Math.pow(2,self.contrast_Control.value)-1)+"*(ssV-"+mean+")":"0")+"+"+n(.875*self.intensity_Control.value)+"*("+rw+")));ssF=1;";
      code+="ssD=min(1,max(0,ssV*4));ssF=ssF*(1-"+n(self.protectShadows_Control.value)+"*(1-ssD*ssD*(3-2*ssD)));";
      code+="ssD=min(1,max(0,(ssV-.75)*4));ssF=ssF*(1-"+n(self.protectHighlights_Control.value)+"*ssD*ssD*(3-2*ssD));ssN=ssV+("+mv+")*ssF*(ssN-ssV);";
      var expressions=[];for(var c=0;c<src.numberOfChannels;c++){var original=rgb?"$T["+c+"]":"$T";
         expressions.push(rgb&&sel!=null&&sel!=c?original:code+"iif(("+mv+")<=1e-8,"+original+",("+(rgb&&sel==null?"min(1,max(0,"+original+"*iif(ssV>1e-8,ssN/max(1e-8,ssV),1)))":"ssN")+"))");}
      var proc=SmartTools.configurePixelMath(new PixelMath,64);proc.symbols="ssV,ssP,ssZ,ssC,ssD,ssN,ssF";proc.useSingleExpression=!rgb;
      proc.expression=expressions[0];if(rgb){proc.expression1=expressions[1];proc.expression2=expressions[2];}
      if(!proc.executeOn(w.mainView,false))throw new Error("Native preview PixelMath failed");self.logApplyStage("Preview: native upload / exact pixel pass",t);t=SmartTools.now();
      var exact=self.prepareFocusedStretch(strength,sp,li,useSymmetry),maxError=0,count=0;
      for(var yy=0;yy<12;yy++)for(var xx=0;xx<16;xx++){var x=Math.min(src.width-1,Math.floor((xx+.5)*src.width/16)),y=Math.min(src.height-1,Math.floor((yy+.5)*src.height/12));
         var signal=self.signalValueAt(src,x,y),weight=self.processingMask?self.processingMask.sample(x,y,0):self.selectionMode=="symmetry"?1:0;
         var width=self.selectionMode=="symmetry"?1:self.processingRangeWidth?self.processingRangeWidth.sample(x,y,0):2*self.clickHalfWidth;
         var target=SmartTools.clamp(exact(signal)+(localMean?(Math.pow(2,self.contrast_Control.value)-1)*(signal-localMean.sample(x,y,0)):0)+.875*self.intensity_Control.value*width,0,1);
         var nv=signal+weight*tonalProtectionFactor(signal,self.protectShadows_Control.value,self.protectHighlights_Control.value)*(target-signal);
         for(var c=0;c<src.numberOfChannels;c++){var original=src.sample(x,y,c),expected=!rgb?nv:sel!=null?(sel==c?nv:original):SmartTools.clamp(original*(signal>1e-8?nv/signal:1),0,1);
            if(weight<=1e-8)expected=original;var actual=w.mainView.image.sample(x,y,c);if(!isFinite(actual))throw new Error("Nonfinite native preview");maxError=Math.max(maxError,Math.abs(expected-actual));count++;}}
      console.writeln("[Smart Stretch Perf] Native preview validation: samples="+count+"; max error="+maxError);if(maxError>3e-7)throw new Error("Native preview/reference mismatch");self.logApplyStage("Preview: native validation",t);return new Image(w.mainView.image);
   };
   this.updateProcessedPreview = function()
   {
      if ( self.workingImage == null || self.isProcessingPreview )
         return;

      var previewStarted=SmartTools.now();
      self.isProcessingPreview = true;
      self.status_Label.text = "Processing preview...";
      if ( self.preview_Button != null )
         self.preview_Button.enabled = false;
      processEvents();

      var tmp=null,boundarySafety=null;
      try
      {
      var src = self.workingImage;
      // Stage 5.8.0 response tuning:
      // Intensity has 1.75x more authority; Stretch has 0.50x the prior response.
      var intensity = 1.75*self.intensity_Control.value;
      var contrast = self.contrast_Control.value;
      var stretch = 0.50*self.stretch_Control.value;
      var localIntensity = self.localIntensity_Control.value;
      var protectShadows = self.protectShadows_Control.value;
      var protectHighlights = self.protectHighlights_Control.value;
      var adaptiveBoundary = self.adaptiveBoundary_Control.value;
      var hdrStrength = self.hdrStrength_Control.value;
      var hdrScale = self.hdrScale_Control.value;
      var hdrAffected=0, hdrColorRecovered=0;
      self.adaptiveBoundaryTriggered=false;
      self.adaptiveBoundaryTriggerCount=0;

      // Stage 5.8.0 optimization: process only the reduced working image.
      // The full-resolution source is never scanned here.
      tmp = null; // Allocate only the selected native result or fallback buffer.
      var W = src.width;
      var H = src.height;
      var C = src.numberOfChannels;

      // Contrast's local mean depends only on the working image/channel,
      // not on slider position, so calculate it once and reuse it.
      var localMean=null;
      if(Math.abs(contrast)>1.0e-8)
         localMean=self.getLocalSignalMean();

      // While a slider is being dragged, process one sample per 2x2 block.
      // Mouse release immediately performs the normal full-quality pass.
      var signalPlane=self.getPreviewPlane(src,self.channelMode,"signalPlaneCache");
      var maskPlane=self.processingMask==null?null:self.getPreviewPlane(self.processingMask,"R","maskPlaneCache");
      var rangePlane=self.processingRangeWidth==null?null:self.getPreviewPlane(self.processingRangeWidth,"R","rangePlaneCache");
      var useSymmetry=self.selectionMode=="symmetry" && self.selections.length>0 &&
         self.selectionType(self.selections[0])=="symmetry";
      var curve=self.getStretchEvaluator(stretch,useSymmetry?self.selections[0].center:self.committedSP,localIntensity,useSymmetry);
      var step=self.adjustmentDragging ? 2 : 1;
      var localGain=Math.pow(2,contrast)-1;

      var nativeDone=false;
      if(!self.exactReferencePass&&typeof PixelMath!="undefined")try{var fast=self.nativePreview(src,localMean,useSymmetry);tmp=fast;nativeDone=true;step=1;}
      catch(e){console.warningln("[Smart Stretch Perf] Native preview fallback: "+e);}
      if(!nativeDone){tmp=new Image(src);
      for ( var y = 0; y < H; y+=step )
         for ( var x = 0; x < W; x+=step )
         {
            var mv=self.processingMask!=null ?
               maskPlane[y*W+x] :
               (self.selectionMode=="symmetry" ? 1.0 : 0.0);
            if(mv<=1.0e-8)
               continue; // tmp already contains the unchanged source pixel.

            var signal=signalPlane[y*W+x];
            var ss=curve(signal);
            var detail=localMean!=null ?
               signal-localMean.sample(x,y,0) : 0;
            var rangeWidth=self.selectionMode=="symmetry" ? 1.0 :
               (self.processingRangeWidth!=null ?
               rangePlane[y*W+x] : 2*self.clickHalfWidth);
            var target=ss+localGain*detail+intensity*rangeWidth*0.5;
            target=Math.max(0,Math.min(1,target));

            // Protection attenuates only the requested change. It does not
            // remap the whole histogram or alter the underlying stretch curve.
            var protection=tonalProtectionFactor(
               signal,protectShadows,protectHighlights);
            var nv=signal+mv*protection*(target-signal);

            // During fast drag preview, fill the corresponding 2x2 block.
            var y2=Math.min(H,y+step),x2=Math.min(W,x+step);
            for(var fy=y;fy<y2;++fy)
               for(var fx=x;fx<x2;++fx)
               {
                  if(C<3)tmp.setSample(nv,fx,fy,0);
                  else if(self.channelMode=="R")tmp.setSample(nv,fx,fy,0);
                  else if(self.channelMode=="G")tmp.setSample(nv,fx,fy,1);
                  else if(self.channelMode=="B")tmp.setSample(nv,fx,fy,2);
                  else
                  {
                     var fs=signalPlane[fy*W+fx];
                     var scale=fs>1.0e-8?nv/fs:1;
                     for(var ch=0;ch<Math.min(3,C);++ch)
                        tmp.setSample(Math.max(0,Math.min(1,
                           src.sample(fx,fy,ch)*scale)),fx,fy,ch);
                  }
               }
         }

      }
      self.logApplyStage("Preview: curve and pixel application",previewStarted);
      var previewPostStart=SmartTools.now();
      // Reference-aware HDR runs after the requested tonal adjustment but
      // before Adaptive Boundary evaluates the final candidate. This lets the
      // boundary detector judge the image the user will actually see.
      if(self.hdrEnable_CheckBox.checked)
      {
         var hdrResult=self.applyReferenceAwareHDR(tmp,hdrStrength,hdrScale);
         if(hdrResult.image!==tmp)tmp.free();
         tmp=hdrResult.image;
         hdrAffected=hdrResult.affected;
         hdrColorRecovered=hdrResult.colorRecovered;
      }

      boundarySafety=self.selectionMode=="symmetry" ? null :
         self.buildAdaptiveBoundarySafety(src,tmp,adaptiveBoundary);
      if(boundarySafety!=null && self.adaptiveBoundaryTriggered)
         for(var by=0;by<H;++by)
            for(var bx=0;bx<W;++bx)
            {
               var bs=boundarySafety.sample(bx,by,0);
               if(bs>=0.999)continue;
               for(var bc=0;bc<C;++bc)
               {
                  var ov=src.sample(bx,by,bc),pv=tmp.sample(bx,by,bc);
                  tmp.setSample(ov+bs*(pv-ov),bx,by,bc);
               }
            }

      try
      {
         if(self.autoHighContrastEnabled){var contrastPreview=self.applyAutoHighContrast(tmp);if(contrastPreview!==tmp){tmp.free();tmp=contrastPreview;}}
         if(self.autoColorBrightnessEnabled){var colorPreview=self.applyAutoColorBrightness(tmp,self.autoBrightnessStrength,self.autoVibranceStrength,false);if(colorPreview!==tmp){tmp.free();tmp=colorPreview;}}
         self.logApplyStage("Preview: HDR and boundary",previewPostStart);
         var histogramStart=SmartTools.now();
         // Live histogram follows the same processed working image as preview.
         var now=SmartTools.now();
         if(!self.adjustmentDragging||now-self.previewHistogramTime>=250){self.histogram.setHistogram(calculateHistogram(tmp,2048,self.channelMode));self.previewHistogramTime=now;}
         else console.writeln("[Smart Stretch Perf] Histogram deferred during drag (250 ms cadence)");
         self.logApplyStage("Preview: histogram",histogramStart);
         var renderStart=SmartTools.now();
         self.processedPreviewBitmap = self.makeFittedPreviewBitmap( tmp );
         self.logApplyStage("Preview: resample and bitmap",renderStart);
         self.previewBitmap = self.processedPreviewBitmap;
         self.before_CheckBox.checked = false;

         self.previewZoom.update();
         self.preview.viewport.update();

         if ( self.basicStretchEnabled )
            self.status_Label.text =
               "Quick Stretch: black=" + self.basicStretchBlack.toFixed(5) +
               " | gain=" + self.basicStretchGain.toFixed(2) +
               " | shoulder=" + self.basicStretchShoulder.toFixed(3) +
               " | near-clip=" + (100*self.quickStretchClipFraction).toFixed(4) + "%";
         else
            self.status_Label.text =
               "Preview updated — processed " + W + " × " + H +
               " working image";
         if(self.hdrEnable_CheckBox.checked)
            self.status_Label.text =
               "HDR active — compressed " + hdrAffected +
               " px | reference color recovery " + hdrColorRecovered + " px";
      }
      catch ( e )
      {
         self.status_Label.text = "Preview error";
         console.warningln( "Smart Stretch preview error: " + e );
      }

      if(self.adaptiveBoundaryTriggered)
         self.status_Label.text="Warning: Adaptive Boundary limiting active ("+
            self.adaptiveBoundaryTriggerCount+" boundary px)";
      }
      catch(previewError)
      {
         self.status_Label.text="Preview error: "+previewError;
         console.warningln("[Smart Stretch Preview] "+previewError);
      }
      finally
      {
         if(boundarySafety!=null)boundarySafety.free();
         if(tmp!=null)tmp.free();
         console.writeln("[Smart Stretch Preview] "+W+"x"+H+" | step="+step+" | total="+SmartTools.elapsed(previewStarted));
         self.isProcessingPreview = false;
         self.preview_Button.enabled = true;
      }
   };


   // Stage 5.8.0 interactive targeted controls.
   this.beginAdjustmentDrag = function()
   {
      if ( !self.adjustmentDragging )
      {
         self.adjustmentDragging = true;
         self.historyDragging = true;
         self.overlayStateBeforeDrag = self.overlayEnabled;
         self.overlayEnabled = false;
         if ( self.preview != null )
            self.preview.viewport.update();
      }
   };

   this.adjustmentTimer=new Timer;this.adjustmentTimer.interval=.08;this.adjustmentTimer.periodic=false;
   this.adjustmentPending=false;this.adjustmentClosed=false;this.adjustmentEvents=0;
   this.liveAdjustmentUpdate=function(){
      if(self.adjustmentClosed||self.historyRestoring||self.applicationInProgress)return;
      self.adjustmentEvents++;
      if(!self.adjustmentPending){self.adjustmentPending=true;self.adjustmentTimer.start();}
   };
   this.flushAdjustmentPreview=function(){
      if(self.adjustmentClosed)return;
      if(self.isProcessingPreview){if(!self.adjustmentPending){self.adjustmentPending=true;self.adjustmentTimer.start();}return;}
      var count=self.adjustmentEvents;self.adjustmentEvents=0;self.adjustmentPending=false;
      console.writeln("[Smart Stretch Perf] Coalesced adjustment preview: "+count+" value events; final="+(!self.adjustmentDragging));
      self.updateProcessedPreview();
   };
   this.adjustmentTimer.onTimeout=function(){self.adjustmentPending=false;self.flushAdjustmentPreview();};
   this.stopAdjustmentPreview=function(){self.adjustmentTimer.stop();self.adjustmentPending=false;self.adjustmentEvents=0;};
   this.endAdjustmentDrag=function(){
      self.adjustmentTimer.stop();self.adjustmentPending=false;self.adjustmentDragging=false;
      self.flushAdjustmentPreview();
      self.overlayEnabled=self.overlayStateBeforeDrag;self.historyDragging=false;self.commitHistory();
      if(self.preview!=null)self.preview.viewport.update();
   };

   this.intensity_Control.onValueUpdated = function( value )
   {
      self.intensityAmount = value;
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };

   this.contrast_Control.onValueUpdated = function( value )
   {
      self.contrastAmount = value;
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };

   this.stretch_Control.onValueUpdated = function()
   {
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };

   this.localIntensity_Control.onValueUpdated = function()
   {
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };
   this.protectShadows_Control.onValueUpdated = function()
   {
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };
   this.protectHighlights_Control.onValueUpdated = function()
   {
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };
   this.adaptiveBoundary_Control.onValueUpdated = function()
   {
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };
   this.hdrEnable_CheckBox.onCheck = function( checked )
   {
      self.hdrStrength_Control.enabled=checked;
      self.hdrScale_Control.enabled=checked;
      if(!self.isProcessingPreview)self.updateProcessedPreview();
      self.commitHistory();
   };
   this.hdrStrength_Control.onValueUpdated = function()
   {
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };
   this.hdrScale_Control.onValueUpdated = function()
   {
      self.liveAdjustmentUpdate();
      self.commitHistory();
   };

   this.intensity_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.contrast_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.stretch_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.localIntensity_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.protectShadows_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.protectHighlights_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.adaptiveBoundary_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.hdrStrength_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };
   this.hdrScale_Control.slider.onMousePress = function()
   {
      self.beginAdjustmentDrag();
   };

   this.intensity_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.contrast_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.stretch_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.localIntensity_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.protectShadows_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.protectHighlights_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.adaptiveBoundary_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.hdrStrength_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };
   this.hdrScale_Control.slider.onMouseRelease = function()
   {
      self.endAdjustmentDrag();
   };

   // -------------------------------------------------------------------------
   // Buttons
   // -------------------------------------------------------------------------

   this.preview_Button = STHoverAttach(new PushButton( this ),"Recalculate the reduced preview without changing source pixels.");
   this.preview_Button.text = STHoverCaption(this.preview_Button,"Update Stretch Preview",0);
   this.preview_Button.toolTip =
      "Render Stretch Factor, Local Intensity, tonal protection, Intensity, and local-detail Contrast changes in the custom preview only.";

   this.basicStretch_Button = new PushButton( this );
   this.basicStretch_Button.text = STHoverCaption(this.basicStretch_Button,"Quick Stretch",0);
   this.basicStretch_Button.toolTip =
      "Automatically push a linear image toward the maximum useful stretch before meaningful RGB clipping, while ignoring a tiny population of extreme pixels.";

   this.autoColorBrightness_Button=new PushButton(this);
   this.autoColorBrightness_Button.text=STHoverCaption(this.autoColorBrightness_Button,"Auto Color & Brightness",0);
   this.autoColorBrightness_Button.toolTip="Toggle the final color/brightness enhancement. Set its strength values in Quick Stretch; the existing baseline and selections are retained.";
   this.autoColorBrightness_Button.onClick=function(){var previous=self.autoColorBrightnessEnabled;
      self.autoColorBrightnessEnabled=!previous;
      try{self.updateProcessedPreview();self.autoColorBrightness_Button.text=STHoverCaption(self.autoColorBrightness_Button,self.autoColorBrightnessEnabled?"Remove Color & Brightness":"Auto Color & Brightness",0);self.commitHistory();}
      catch(e){self.autoColorBrightnessEnabled=previous;throw e;}
   };
   this.autoHighContrast_Button = new PushButton(this);
   this.autoHighContrast_Button.text=STHoverCaption(this.autoHighContrast_Button,"Auto High Contrast",0);
   this.autoHighContrast_Button.toolTip="Boost local structure in low-contrast regions with soft signal and highlight protection. Click again to remove the preview adjustment.";
   this.autoHighContrast_Button.onClick=function(){var previous=self.autoHighContrastEnabled;
      self.autoHighContrastEnabled=!previous;
      try{self.updateProcessedPreview();self.autoHighContrast_Button.text=STHoverCaption(self.autoHighContrast_Button,self.autoHighContrastEnabled?"Remove High Contrast":"Auto High Contrast",0);self.commitHistory();}
      catch(e){self.autoHighContrastEnabled=previous;throw e;}
   };
   this.resetStretch_Button = new PushButton( this );
   this.resetStretch_Button.text = STHoverCaption(this.resetStretch_Button,"Reset Stretch",0);

   // Compact icon-only Undo/Redo controls. The arrow glyphs are deliberately
   // heavy for visibility. Standard enabled state provides PixInsight's
   // disabled/grayed appearance when an action is unavailable.
   this.undo_Button = STHoverAttach(new ToolButton( this ),"Restore the previous saved adjustment state.");
   this.undo_Button.text = STHoverCaption(this.undo_Button,"\u21B6",0); // ANTICLOCKWISE TOP SEMICIRCLE ARROW
   this.undo_Button.toolTip = "Undo the last Smart Stretch edit.";
   this.undo_Button.setFixedSize( 34, 30 );
   this.undo_Button.enabled = false;

   this.redo_Button = STHoverAttach(new ToolButton( this ),"Restore the next adjustment state after Undo.");
   this.redo_Button.text = STHoverCaption(this.redo_Button,"\u21B7",0); // CLOCKWISE TOP SEMICIRCLE ARROW
   this.redo_Button.toolTip = "Redo the last undone Smart Stretch edit.";
   this.redo_Button.setFixedSize( 34, 30 );
   this.redo_Button.enabled = false;

   this.historyButton_Sizer = new HorizontalSizer;
   this.historyButton_Sizer.spacing = 3;
   this.historyButton_Sizer.add( this.undo_Button );
   this.historyButton_Sizer.add( this.redo_Button );

   this.refresh_Button = new PushButton( this );
   this.refresh_Button.text = STHoverCaption(this.refresh_Button,"Refresh Active View",0);
   this.refresh_Button.toolTip =
      "Reload the currently active PixInsight image or Preview.";

   this.close_Button = new PushButton( this );
   this.close_Button.text = STHoverCaption(this.close_Button,"Close",0);

   // Use the same native instance icon as Smart Suite Launcher.
   this.newInstance_Button = STHoverAttach(new ToolButton( this ),"Capture a snapshot of the current Smart Stretch settings.");
   this.newInstance_Button.toolTip =
      "New Instance — drag this triangle onto the PixInsight workspace.";
   this.newInstance_Button.icon = this.scaledResource( ":/process-interface/new-instance.png" );
   this.newInstance_Button.setFixedSize( 24, 24 );

   this.apply_Button = STHoverAttach(new ToolButton( this ),"Apply the current adjustments to the full-resolution source image. PixInsight Undo is available.");
   this.apply_Button.toolTip =
      "Apply the current Smart Stretch preview settings.";
   this.apply_Button.setFixedSize( 24, 24 );
   this.apply_Button.icon = this.scaledResource( ":/process-interface/apply.png" );

   // Global settings reset: icon only, bottom-right. This resets Smart
   // Stretch controls/selections, but never reloads or changes the baseline.
   // Bottom-right reset control. Draw a PixInsight-style four-corner
   // "restore/reset" symbol instead of using a text glyph.
   this.resetAll_Button = STHoverAttach(new ToolButton( this ),"Reset all adjustment controls and selections without changing the source image.");
   this.resetAll_Button.text = STHoverCaption(this.resetAll_Button,"",0);
   this.resetAll_Button.toolTip =
      "Reset Smart Stretch settings and selections to their initial values.";
   this.resetAll_Button.setFixedSize( 46, 42 );
   this.resetAll_Button.onPaint = function( x0, y0, x1, y1 )
   {
      var g=new Graphics(this);
      try
      {
         var cx=Math.round(this.width/2);
         var cy=Math.round(this.height/2);
         var d=10, a=5;
         g.pen=new Pen(this.enabled ? 0xff58a8ff : 0xff808080,3);

         // Four diagonal shafts point inward toward a small center opening.
         g.drawLine(cx-d,cy-d,cx-4,cy-4);
         g.drawLine(cx+d,cy-d,cx+4,cy-4);
         g.drawLine(cx-d,cy+d,cx-4,cy+4);
         g.drawLine(cx+d,cy+d,cx+4,cy+4);

         // Arrowheads at the inward ends.
         g.drawLine(cx-4,cy-4,cx-4-a,cy-4);
         g.drawLine(cx-4,cy-4,cx-4,cy-4-a);
         g.drawLine(cx+4,cy-4,cx+4+a,cy-4);
         g.drawLine(cx+4,cy-4,cx+4,cy-4-a);
         g.drawLine(cx-4,cy+4,cx-4-a,cy+4);
         g.drawLine(cx-4,cy+4,cx-4,cy+4+a);
         g.drawLine(cx+4,cy+4,cx+4+a,cy+4);
         g.drawLine(cx+4,cy+4,cx+4,cy+4+a);
      }
      finally
      {
         g.end();
      }
   };

   this.undo_Button.onClick = function()
   {
      self.undoHistory();
   };

   this.redo_Button.onClick = function()
   {
      self.redoHistory();
   };

   this.preview_Button.onClick = function()
   {
      self.updateProcessedPreview();
   };

   this.basicStretch_Button.onClick = function()
   {
      self.applyBasicStretchPreview();
   };

   this.before_CheckBox.onCheck = function( checked )
   {
      if ( checked )
      {
         if ( self.originalPreviewBitmap != null )
         {
            self.previewBitmap = self.originalPreviewBitmap;
            if(self.workingImage!=null)
               self.histogram.setHistogram(
                  calculateHistogram(self.workingImage, 2048,self.channelMode));
            self.status_Label.text = "Showing Before";
         }
      }
      else
      {
         if ( self.processedPreviewBitmap != null )
         {
            self.previewBitmap = self.processedPreviewBitmap;
            self.status_Label.text = "Showing After";
            if(!self.isProcessingPreview)
               self.updateProcessedPreview();
         }
         else if ( self.originalPreviewBitmap != null )
         {
            self.previewBitmap = self.originalPreviewBitmap;
            self.status_Label.text = "No stretch preview yet";
         }
      }

      if ( self.previewBitmap != null )
      {
         self.previewZoom.update();
         self.preview.viewport.update();
      }
   };

   this.resetAllSettings = function()
   {
      self.historyRestoring=true;
      try
      {
         // Preserve sourceWorkingImage, workingImage and Quick Stretch baseline.
         self.selectionMode="symmetry";
         self.symmetryMode_Radio.checked=true;
         self.signalMode_Radio.checked=false;
         self.colorMode_Radio.checked=false;
         self.lowContrastMode_Radio.checked=false;self.lowContrastSensitivity_Control.setValue(50);self.lowContrastScale_Control.setValue(3);self.lowContrastCache=null;

         self.channelMode="RGBK";
         self.rgbkChannel_Radio.checked=true;
         self.rChannel_Radio.checked=false;
         self.gChannel_Radio.checked=false;
         self.bChannel_Radio.checked=false;
         self.histogram.setChannelMode("RGBK");

         self.clickHalfWidth=0.025;
         self.colorTolerance=0.10;self.connectedColor_CheckBox.checked=false;self.faintColorReach_Control.setValue(.5);
         self.width_Control.setValue(0.025);
         self.colorTolerance_Control.setValue(0.10);

         self.intensity_Control.setValue(0.0);
         self.contrast_Control.setValue(0.0);
         self.setStretchFocus("center");
         self.stretch_Control.setValue(0.0);
         self.localIntensity_Control.setValue(0.5);
         self.protectShadows_Control.setValue(0.0);
         self.protectHighlights_Control.setValue(0.0);
         self.adaptiveBoundary_Control.setValue(0.65);
         self.hdrEnable_CheckBox.checked=false;
         self.hdrStrength_Control.setValue(0.50);
         self.hdrScale_Control.setValue(0.45);
         self.hdrStrength_Control.enabled=false;
         self.hdrScale_Control.enabled=false;

         self.overlayEnabled=true;
         self.overlay_CheckBox.checked=true;
         self.inverseSelection=false;
         self.inverseSelection_CheckBox.checked=false;
         self.overlayStrength=0.55;
         self.overlayStrength_Control.setValue(0.55);

         self.before_CheckBox.checked=false;
         self.sampleX=-1; self.sampleY=-1;
         self.samplePoints=[];
         self.selections=[{type:"symmetry",center:0.5,low:0.5,high:0.5,
                           spatial:false,spatialMask:null}];
         self.maskEdits=[];
         if(self.smartMask!=null){self.smartMask.free();self.smartMask=null;}
         self.lassoActive=false;
         self.lassoEnable_CheckBox.checked=false;
         self.lassoDrawing=false;
         self.lassoPoints=[];
         self.lassoMode="subtract";
         self.lassoSubtract_Radio.checked=true;
         self.lassoKeep_Radio.checked=false;

         // Rebuild signal map/histogram from the CURRENT baseline image.
         if(self.workingImage!=null)
         {
            if(self.overlayImage!=null)self.overlayImage.free();
            self.overlayImage=self.buildOverlayMap(self.workingImage);
            if(self.processingMask!=null)
            {
               self.processingMask.free();
               self.processingMask=null;
            }
            self.histogram.setHistogram(
               calculateHistogram(self.workingImage, 2048,self.channelMode));
            self.histogram.resetZoom();
            self.originalPreviewBitmap=self.makeFittedPreviewBitmap(self.workingImage);
            self.processedPreviewBitmap=null;
            self.previewBitmap=self.originalPreviewBitmap;
            self.previewZoom.update();
         }
         self.syncSelectionUI();
         self.preview.viewport.update();
      }
      finally
      {
         self.historyRestoring=false;
      }
      // Reset is a normal edit: preserve prior history and add this state.
      self.autoPeakPendingSP();
      self.commitHistory();
      self.status_Label.text="Settings reset — selected SP is pending manual Commit";
   };

   this.resetAll_Button.onClick=function()
   {
      self.resetAllSettings();
   };

   this.resetStretch_Button.onClick = function()
   {
      self.setStretchFocus("center");
      self.intensity_Control.setValue( 0.0 );
      self.contrast_Control.setValue( 0.0 );
      self.stretch_Control.setValue( 0.0 );
      self.localIntensity_Control.setValue( 0.5 );
      self.protectShadows_Control.setValue( 0.0 );
      self.protectHighlights_Control.setValue( 0.0 );
      self.adaptiveBoundary_Control.setValue( 0.65 );
      self.hdrEnable_CheckBox.checked = false;
      self.hdrStrength_Control.setValue( 0.50 );
      self.hdrScale_Control.setValue( 0.45 );
      self.hdrStrength_Control.enabled = false;
      self.hdrScale_Control.enabled = false;
      self.basicStretchEnabled = false;
      self.autoHighContrastEnabled = false;
      self.autoColorBrightnessEnabled=false;self.autoBrightnessStrength=.35;self.autoVibranceStrength=.25;
      if(self.autoColorBrightness_Button)self.autoColorBrightness_Button.text=STHoverCaption(self.autoColorBrightness_Button,"Auto Color & Brightness",0);
      if(self.autoHighContrast_Button)self.autoHighContrast_Button.text=STHoverCaption(self.autoHighContrast_Button,"Auto High Contrast",0);
      self.quickAnalysisRecipe = null;
      self.basicStretchFaintEnabled = false;
      self.basicStretchFaintParameters = null;
      self.quickNebulosityEnabled=false;self.quickNebulosityStrength=.35;
      self.clearQuickNebulosityGuide();
      self.basicStretchLinearEnabled = false;
      self.basicStretchGain = 1.0;
      self.basicStretchBlack = 0.0;
      self.basicStretchShoulder = 0.70;
      self.basicStretchShoulderStrength = 0.84;
      self.quickStretchClipFraction = 0.0;
      self.adjustmentDragging = false;
      self.processedPreviewBitmap = null;
      self.before_CheckBox.checked = false;
      self.loadActiveView();
      self.status_Label.text = "Stretch reset";
      self.commitHistory();
   };

   this.refresh_Button.onClick = function()
   {
      if(self.smartMask!=null){self.smartMask.free();self.smartMask=null;}
      if(self.originalFullImage!=null)
      {
         self.originalFullImage.free();
         self.originalFullImage=null;
      }
      if(self.loadActiveView())
      {
         self.history=[];
         self.historyIndex=-1;
         self.commitHistory();
         self.status_Label.text="Active view refreshed — history cleared";
         self.offerQuickStretchIfLinear();
      }
   };

   this.close_Button.onClick = function()
   {
      self.ok();
   };

   this.apply_Button.onClick = function()
   {
      self.applyToExternalImage();
   };

   this.newInstance_Button.onMousePress = function(x,y,button)
   {
      if(button!=MouseButton_Left||self.applicationInProgress)return;
      this.hasFocus=true;this.pushed=false;
      try{
         if(!self.activeView||self.activeView.isNull)throw new Error("Load an image first.");
         Parameters.set("smartStretchState",JSON.stringify({schema:1,viewId:self.activeView.fullId,settings:self.captureHistoryState()}));
         self.newInstance();
      }catch(e){new MessageBox(String(e),"Smart Stretch",StdIcon_Error,StdButton_Ok).execute();}
   };

   // -------------------------------------------------------------------------
   // Layout
   // -------------------------------------------------------------------------

   // Workflow-oriented two-column layout:
   // LEFT  = image preview + histogram/channel tools
   // RIGHT = source/view, selection, stretch, protection and HDR controls.

   this.makeSectionLabel = function( title, hint )
   {
      var L=new Label(this);
      L.useRichText=true;
      L.text="<b>"+title+"</b>"+
         (hint!=null && hint.length>0 ? "  <i>"+hint+"</i>" : "");
      L.setMinHeight(24);
      return L;
   };

   // ---- SOURCE & VIEW -------------------------------------------------------
   this.sourceSection_Label=this.makeSectionLabel("SOURCE & VIEW","");
   this.sourceActions_Sizer=new HorizontalSizer;
   this.sourceActions_Sizer.spacing=6;
   this.sourceActions_Sizer.add(this.refresh_Button);
   this.sourceActions_Sizer.add(this.basicStretch_Button);
   this.sourceActions_Sizer.add(this.autoHighContrast_Button);
   this.sourceActions_Sizer.add(this.autoColorBrightness_Button);
   this.sourceActions_Sizer.add(this.before_CheckBox);
   this.sourceActions_Sizer.addStretch();
   this.sourceActions_Sizer.add(this.undo_Button);
   this.sourceActions_Sizer.add(this.redo_Button);
   this.sourceActions_Sizer.add(this.resetAll_Button);

   this.sourceSection_Sizer=new VerticalSizer;
   this.sourceSection_Sizer.spacing=5;
   this.sourceSection_Sizer.add(this.sourceSection_Label);
   this.sourceSection_Sizer.add(this.sourceActions_Sizer);
   this.sourceSection_Sizer.add(this.source_Label);

   // ---- SELECTION -----------------------------------------------------------
   this.selectionSection_Label=this.makeSectionLabel(
      "SELECTION","( What am I processing? )");

   this.range_Sizer = new VerticalSizer;
   this.range_Sizer.spacing = 5;
   this.range_Sizer.add( this.low_Control );
   this.range_Sizer.add( this.high_Control );

   this.selectionTop_Sizer=new VerticalSizer;
   this.selectionTop_Sizer.spacing=5;
   this.selectionMode_Control.sizer=this.selectionMode_Sizer;
   this.selectionTop_Sizer.add(this.selectionMode_Control);
   this.selectionTop_Sizer.add(this.range_Sizer);
   this.selectionTop_Sizer.add(this.width_Control);
   this.selectionTop_Sizer.add(this.colorTolerance_Control);
   this.selectionTop_Sizer.add(this.lowContrastSensitivity_Control);this.selectionTop_Sizer.add(this.lowContrastScale_Control);
   this.selectionTop_Sizer.add(this.connectedColor_CheckBox);this.selectionTop_Sizer.add(this.faintColorReach_Control);

   this.selectionMask_Sizer=new VerticalSizer;
   this.selectionMask_Sizer.spacing=5;
   this.selectionMask_Sizer.add(this.maskOptions_Sizer);
   this.selectionMask_Sizer.add(this.overlayStrength_Control);
   this.lassoMode_Control.sizer=this.lasso_Sizer;
   this.selectionMask_Sizer.add(this.lassoMode_Control);
   this.selectionMask_Sizer.add(this.range_Label);

   this.selectionSection_Sizer=new VerticalSizer;
   this.selectionSection_Sizer.spacing=5;
   this.selectionSection_Sizer.add(this.selectionSection_Label);
   this.selectionSection_Sizer.add(this.selectionTop_Sizer);
   this.selectionSection_Sizer.addSpacing(3);
   this.selectionSection_Sizer.add(this.selectionMask_Sizer);

   // Statistical guidance is advisory: it never changes the source image.
   this.statGuidance_Label=new Label(this);
   this.statGuidance_Label.text="Statistics: select Analyze to estimate shadow clipping.";
   this.statGuidance_Label.toolTip="Sampled estimates from the reduced working image; not full-resolution counts.";
   this.statGuidance_Button=new PushButton(this);
   this.statGuidance_Button.text=STHoverCaption(this.statGuidance_Button,"Analyze / Suggest",0);
   this.statGuidance_Button.toolTip="Estimate blackpoint clipping and suggest a starting stretch. Does not apply changes.";
   this.statGuidance_Button.onClick=function()
   {
      try
      {
         var im=self.workingImage;
         if(im==null)throw new Error("No working image");
         var W=im.width,H=im.height,C=im.numberOfChannels;
         var stride=Math.max(1,Math.ceil(Math.sqrt(W*H/120000)));
         var samples=[],minv=1,maxv=0;
         for(var y=0;y<H;y+=stride)
            for(var x=0;x<W;x+=stride)
            {
               var v=C==1?im.sample(x,y,0):
                  0.2126*im.sample(x,y,0)+0.7152*im.sample(x,y,1)+0.0722*im.sample(x,y,2);
               if(!isFinite(v))continue;
               samples.push(v);
               if(v<minv)minv=v;
               if(v>maxv)maxv=v;
            }
         if(samples.length<16)throw new Error("Not enough samples");
         samples.sort(function(a,b){return a-b;});
         var n=samples.length,med=samples[Math.floor(n/2)];
         var dev=[];
         for(var i=0;i<n;++i)dev.push(Math.abs(samples[i]-med));
         dev.sort(function(a,b){return a-b;});
         var sigma=1.4826*dev[Math.floor(n/2)];
         var bp=Math.max(minv,med-5*sigma);
         var clipped=0;
         for(var j=0;j<n;++j)if(samples[j]<bp)++clipped;
         var pct=100*clipped/n;
         // A conservative starting point, deliberately not an exact inversion
         // of AS; the user can inspect it before accepting.
         var suggested=med<0.02?7:med<0.07?5:med<0.15?3:1.5;
         self.statGuidance_Label.text="Median="+med.toFixed(5)+
            "  MAD sigma="+sigma.toFixed(5)+"  BP="+bp.toFixed(5)+
            "  below BP="+pct.toFixed(3)+"% (sampled)";
         console.writeln("[Smart Stretch Statistics] samples="+n+
            " median="+med+" robustSigma="+sigma+" blackpoint="+bp+
            " belowBlackpoint="+clipped+"/"+n+" ("+pct.toFixed(4)+"%)"+
            " suggestedStretch="+suggested);
         var question="Suggested starting Stretch Factor: "+suggested.toFixed(1)+
            "\\n\\n"+self.statGuidance_Label.text+
            "\\n\\nUse this suggested value?";
         if((new MessageBox(question,"Smart Stretch Statistics",
            StdIcon_Question,StdButton_Yes,StdButton_No)).execute()==StdButton_Yes)
         {
            self.stretch_Control.setValue(suggested);
            self.updateProcessedPreview();
         }
      }
      catch(e)
      {
         console.warningln("[Smart Stretch Statistics] "+e);
         new MessageBox(""+e,"Smart Stretch Statistics",StdIcon_Error,StdButton_Ok).execute();
      }
   };

   // ---- STRETCH -------------------------------------------------------------
   this.stretchSection_Label=this.makeSectionLabel(
      "STRETCH","( What do I want to do to it? )");
   this.stretchSection_Sizer=new VerticalSizer;
   this.stretchSection_Sizer.spacing=5;
   this.stretchSection_Sizer.add(this.stretchSection_Label);
   this.stretchSection_Sizer.add(this.stretchFocus_Control);
   this.stretchSection_Sizer.add(this.stretch_Control);
   this.stretchSection_Sizer.add(this.localIntensity_Control);
   this.stretchSection_Sizer.add(this.statGuidance_Button);
   this.stretchSection_Sizer.add(this.statGuidance_Label);
   this.stretchSection_Sizer.add(this.intensity_Control);
   this.stretchSection_Sizer.add(this.contrast_Control);

   this.stretchActions_Sizer=new HorizontalSizer;
   this.stretchActions_Sizer.spacing=6;
   this.stretchActions_Sizer.add(this.preview_Button);
   this.stretchActions_Sizer.add(this.resetStretch_Button);
   this.stretchActions_Sizer.addStretch();
   this.stretchSection_Sizer.add(this.stretchActions_Sizer);
   this.dirtyApply_CheckBox=new CheckBox(this);this.dirtyApply_CheckBox.text=STHoverCaption(this.dirtyApply_CheckBox,"Use dirty Apply (experimental)",0);this.dirtyApply_CheckBox.checked=true;
   this.dirtyApply_CheckBox.toolTip="Try preview-mask coverage and full-resolution tiles for selected tonal/contrast edits. Global, HDR, Adaptive Boundary and Quick operations fall back automatically; see console.";
   this.dirtyVerify_CheckBox=new CheckBox(this);this.dirtyVerify_CheckBox.text=STHoverCaption(this.dirtyVerify_CheckBox,"Verify dirty Apply against full reference (slow)",0);this.dirtyVerify_CheckBox.checked=false;
   this.dirtyVerify_CheckBox.toolTip="Testing only: compute the normal full-resolution reference and compare every channel sample, including clean tiles, before writing.";
   this.stretchSection_Sizer.add(this.dirtyApply_CheckBox);this.stretchSection_Sizer.add(this.dirtyVerify_CheckBox);

   // ---- PROTECTION ----------------------------------------------------------
   this.protectionSection_Label=this.makeSectionLabel(
      "PROTECTION","( What should Smart Stretch protect? )");
   this.protectionSection_Sizer=new VerticalSizer;
   this.protectionSection_Sizer.spacing=5;
   this.protectionSection_Sizer.add(this.protectionSection_Label);
   this.protectionSection_Sizer.add(this.protectShadows_Control);
   this.protectionSection_Sizer.add(this.protectHighlights_Control);
   this.protectionSection_Sizer.add(this.adaptiveBoundary_Control);

   // ---- HDR -----------------------------------------------------------------
   this.hdrSection_Label=this.makeSectionLabel(
      "HDR","( Recover detail and color in bright structures )");
   this.hdrSection_Sizer=new VerticalSizer;
   this.hdrSection_Sizer.spacing=5;
   this.hdrSection_Sizer.add(this.hdrSection_Label);
   this.hdrSection_Sizer.add(this.hdrEnable_CheckBox);
   this.hdrSection_Sizer.add(this.hdrStrength_Control);
   this.hdrSection_Sizer.add(this.hdrScale_Control);

   // Right-side tool column. Controls are grouped by the order in which the
   // user thinks about the operation rather than by implementation history.
   this.controlPanel_Sizer=new VerticalSizer;
   this.controlPanel_Sizer.spacing=10;
   this.controlPanel_Sizer.add(this.sourceSection_Sizer);
   this.controlPanel_Sizer.addSpacing(3);
   this.controlPanel_Sizer.add(this.selectionSection_Sizer);
   this.controlPanel_Sizer.addSpacing(3);
   this.controlPanel_Sizer.add(this.stretchSection_Sizer);
   this.controlPanel_Sizer.addSpacing(3);
   this.controlPanel_Sizer.add(this.protectionSection_Sizer);
   this.controlPanel_Sizer.addSpacing(3);
   this.controlPanel_Sizer.add(this.hdrSection_Sizer);
   this.controlPanel_Sizer.addStretch();

   // ---- LEFT IMAGE / HISTOGRAM COLUMN --------------------------------------
   // Preserve the established 1280-pixel preview/histogram alignment.
   var fittedPreview=STScreenFit.previewSize(this.preview,1280,760);this.histogram.setFixedWidth(fittedPreview.width);

   this.histogramRow_Sizer=new HorizontalSizer;
   this.histogramRow_Sizer.add(this.histogram);
   this.histogramRow_Sizer.addStretch();

   this.channelWidth_Control.setMinWidth(fittedPreview.width);
   this.channelWidth_Control.sizer=this.channel_Sizer;
   this.channelRow_Sizer=new HorizontalSizer;
   this.channelRow_Sizer.add(this.channelWidth_Control);
   this.channelRow_Sizer.addStretch();

   this.zoomWidth_Control=new Control(this);
   this.zoomWidth_Control.setMinWidth(fittedPreview.width);
   this.zoomWidth_Control.sizer=this.histogramZoom_Sizer;
   this.zoomRow_Sizer=new HorizontalSizer;
   this.zoomRow_Sizer.add(this.zoomWidth_Control);
   this.zoomRow_Sizer.addStretch();

   this.previewSection_Label=this.makeSectionLabel("PREVIEW","");
   this.histogramSection_Label=this.makeSectionLabel("HISTOGRAM & CHANNEL","");

   this.leftColumn_Sizer=new VerticalSizer;
   this.leftColumn_Sizer.spacing=6;
   this.leftColumn_Sizer.add(this.previewSection_Label);
   this.leftColumn_Sizer.add(this.preview,100);
   this.leftColumn_Sizer.add(this.previewZoom.row);
   this.leftColumn_Sizer.addSpacing(4);
   this.leftColumn_Sizer.add(this.histogramSection_Label);
   this.leftColumn_Sizer.add(this.histogramRow_Sizer);
   this.leftColumn_Sizer.add(this.channelRow_Sizer);
   this.leftColumn_Sizer.add(this.zoomRow_Sizer);

   this.workspace_Sizer=new HorizontalSizer;
   this.workspace_Sizer.spacing=12;
   this.workspace_Sizer.add(this.leftColumn_Sizer,100);
   this.controlPanelScroll=STScreenFit.panel(this,this.controlPanel_Sizer);this.workspace_Sizer.add(this.controlPanelScroll);

   this.bottom_Sizer=new HorizontalSizer;
   this.bottom_Sizer.spacing=8;
   this.bottom_Sizer.add(this.newInstance_Button);
   this.bottom_Sizer.add(this.apply_Button);
   this.bottom_Sizer.addSpacing(4);
   this.bottom_Sizer.add(this.status_Label,100);
   this.bottom_Sizer.add(this.close_Button);

   this._stBody=new VerticalSizer;
   this._stBody.margin=10;
   this._stBody.spacing=8;
   this._stBody.add(this.workspace_Sizer,100);
   this._stBody.add(this.bottom_Sizer);this._stFooter=this.bottom_Sizer;

   // -------------------------------------------------------------------------
   // Load active image / preview
   // -------------------------------------------------------------------------

   this.appearsLinear = function( image )
   {
      if(image==null)return false;
      var values=[];
      var W=image.width,H=image.height,C=image.numberOfChannels;
      var step=Math.max(1,Math.floor(Math.sqrt((W*H)/80000)));
      for(var y=0;y<H;y+=step)
         for(var x=0;x<W;x+=step)
         {
            var v;
            if(C<3)v=image.sample(x,y,0);
            else v=0.2126*image.sample(x,y,0)+
                   0.7152*image.sample(x,y,1)+
                   0.0722*image.sample(x,y,2);
            values.push(Math.max(0,Math.min(1,v)));
         }
      if(values.length<32)return false;
      values.sort(function(a,b){return a-b;});
      function pct(q)
      {
         var i=Math.floor(q*(values.length-1));
         if(i<0)i=0;if(i>=values.length)i=values.length-1;
         return values[i];
      }
      var p50=pct(0.50),p90=pct(0.90),p99=pct(0.99);
      // Conservative astrophotography heuristic: a linear frame normally has
      // most pixels compressed close to black with a relatively narrow body.
      return p50<0.12 && p90<0.28 && (p90-p50)<0.18 && p99<0.75;
   };

   this.offerQuickStretchIfLinear = function()
   {
      if(self.sourceWorkingImage==null || !self.appearsLinear(self.sourceWorkingImage))
         return;
      var answer=(new MessageBox(
         "This image appears to be linear.\n\nApply Quick Stretch to the Smart Stretch preview?",
         "Smart Stretch — Linear Image Detected",
         StdIcon_Question,
         StdButton_Yes,
         StdButton_No
      )).execute();
      if(answer==StdButton_Yes)
         self.applyBasicStretchPreview();
   };

   this.loadActiveView = function()
   {
      var w = initialTarget&&!initialTarget.isNull ? initialTarget.window : ImageWindow.activeWindow;

      if ( w.isNull )
      {
         (new MessageBox(
            "Open an image and make an image or Preview active before running Smart Stretch.",
            "Smart Stretch",
            StdIcon_Warning,
            StdButton_Ok
         )).execute();

         return false;
      }

      var view = initialTarget&&!initialTarget.isNull ? initialTarget : w.currentView;initialTarget=null;

      if ( view.isNull )
         view = w.mainView;

      var image = view.image;

       if(self.originalFullImage==null || self.activeView==null ||
          self.activeView.id!=view.id)
       {
          if(self.originalFullImage!=null)self.originalFullImage.free();
          self.originalFullImage=new Image(image);
       }
       self.invalidatePreviewCaches();
      self.activeView = view;
      self.pendingSP=0.5;
       self.committedSP=0.5;
      self.sampleX = -1;
      self.sampleY = -1;
      self.samplePoints = [];
      self.maskEdits=[];
      self.lassoDrawing=false;
      self.lassoPoints=[];
      self.basicStretchEnabled = false;
      self.autoHighContrastEnabled = false;
      self.autoColorBrightnessEnabled=false;self.autoBrightnessStrength=.35;self.autoVibranceStrength=.25;
      if(self.autoColorBrightness_Button)self.autoColorBrightness_Button.text=STHoverCaption(self.autoColorBrightness_Button,"Auto Color & Brightness",0);
      if(self.autoHighContrast_Button)self.autoHighContrast_Button.text=STHoverCaption(self.autoHighContrast_Button,"Auto High Contrast",0);
      self.quickAnalysisRecipe = null;
      self.basicStretchFaintEnabled = false;
      self.basicStretchFaintParameters = null;
      self.quickNebulosityEnabled=false;self.quickNebulosityStrength=.35;
      self.clearQuickNebulosityGuide();
      self.basicStretchLinearEnabled = false;
      self.basicStretchGain = 1.0;
      self.basicStretchBlack = 0.0;
      self.basicStretchShoulder = 0.70;
      self.basicStretchShoulderStrength = 0.84;
      self.quickStretchClipFraction = 0.0;
      self.setStretchFocus("center");
      // Every newly loaded source starts in the default Symmetry Point mode.
      self.selectionMode="symmetry";
      self.selections=[{type:"symmetry",center:0.5,low:0.5,high:0.5,
                        spatial:false,spatialMask:null}];

      // Stage 5.8.0: create one reduced working image and reuse it for all
      // interactive preview operations.
      if ( self.sourceWorkingImage != null )
         self.sourceWorkingImage.free();
      self.sourceWorkingImage = self.makeWorkingImage( image );

      if ( self.workingImage != null )
         self.workingImage.free();
      self.workingImage = new Image( self.sourceWorkingImage );

      if ( self.overlayImage != null )
         self.overlayImage.free();
      self.overlayImage = self.buildOverlayMap( self.workingImage );
      if ( self.processingMask != null )
      {
         self.processingMask.free();
         self.processingMask = null;
      }

      try
      {
         self.originalPreviewBitmap =
            self.makeFittedPreviewBitmap( self.workingImage );
         self.processedPreviewBitmap = null;
         self.previewBitmap = self.originalPreviewBitmap;
         self.before_CheckBox.checked = false;

         self.previewZoom.update();

         self.preview.viewport.update();
      }
      catch ( e )
      {
         console.warningln(
            "Smart Stretch: Could not render custom preview: " + e
         );
         self.previewBitmap = null;
      }

      self.histogram.setHistogram(
         calculateHistogram( image, 2048, self.channelMode )
      );

      self.source_Label.text =
         "Source: " + view.id +
         "   |   " + image.width + " × " + image.height +
         "   |   " + image.numberOfChannels + " channel(s)";

      self.status_Label.text =
         "Ready — working " + self.workingImage.width + " × " +
         self.workingImage.height + " → display " +
         self.previewBitmap.width + " × " + self.previewBitmap.height;
      // Explicitly reassert the default radio state after source loading.
      // This avoids PJSR radio-group initialization leaving the row with no
      // visibly selected button.
      self.symmetryMode_Radio.checked=true;
      self.signalMode_Radio.checked=false;
      self.colorMode_Radio.checked=false;
      self.histogram.setSelectionMode("symmetry");
      self.syncSelectionUI();
      if(!self.applicationInProgress)self.autoPeakPendingSP(image);
      return true;
   };

   this.onShow=function(){
      self.previewZoom.plus.setFixedWidth(26);self.previewZoom.plus.setFixedHeight(26);
      self.previewZoom.minus.setFixedWidth(26);self.previewZoom.minus.setFixedHeight(26);
      self.previewZoom.update();
   };
   this.previewZoom.install();
   var initialLoaded=self.loadActiveView();
   self.history=[];
   this.historyIndex=-1;
   this.commitHistory();
   this.trainerWinnerMode=!!trainerWinnerMode;
   if(initialLoaded&&!this.trainerWinnerMode)
      self.offerQuickStretchIfLinear();

   // Focus-loss text commits; sliders retain immediate native updates.
   var numericInputs=[this.lowContrastSensitivity_Control,this.lowContrastScale_Control,this.low_Control,this.high_Control,this.width_Control,this.overlayStrength_Control,this.colorTolerance_Control,this.intensity_Control,this.contrast_Control,this.stretch_Control,this.localIntensity_Control,this.protectShadows_Control,this.protectHighlights_Control,this.adaptiveBoundary_Control,this.hdrStrength_Control,this.hdrScale_Control];
   for(var ni=0;ni<numericInputs.length;++ni)SmartTools.configureNumericInput(numericInputs[ni]);
   self.channelMode="RGBK";self.selectionMode="symmetry";
   self.rChannel_Radio.checked=false;self.gChannel_Radio.checked=false;self.bChannel_Radio.checked=false;self.rgbkChannel_Radio.checked=true;
   self.signalMode_Radio.checked=false;self.colorMode_Radio.checked=false;self.symmetryMode_Radio.checked=true;self.lowContrastMode_Radio.checked=false;
   self.lowContrastSensitivity_Control.visible=false;self.lowContrastScale_Control.visible=false;
   self.histogram.setChannelMode("RGBK");self.histogram.setSelectionMode("symmetry");self.stopAdjustmentPreview();
   STScreenFit.adjust(this);

   // Favor a wide desktop layout instead of a tall stacked dialog.
   // Window dimensions are bounded when the dialog opens.
   // Reframe after layout establishes the histogram's actual pixel dimensions.
   // The selected SP remains the deterministic value chosen during loading.
   if(initialLoaded && self.selectionMode=="symmetry")self.histogram.zoomToPeak();
}

SmartStretchDialog.prototype = new Dialog;

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

function SmartStretchCleanup(dialog){dialog.clearQuickNebulosityGuide();dialog.adjustmentClosed=true;dialog.stopAdjustmentPreview();if(dialog.autoContrastCache)dialog.autoContrastCache.map.free();SmartTools.closeWindowPool(dialog.previewNativePool);if(dialog.hdrMeanCache)dialog.hdrMeanCache.image.free();SmartMaskEngine.clearCache();SmartTools.closeWindowPool(dialog.nativeWorkspace);SmartTools.closeWindowPool(dialog.nativeQuickWorkspace);SmartTools.closeWindowPool(dialog.nativeQuickFaintWorkspace);}

function main()
{
   console.hide();

   var state=Parameters.has("smartStretchState")?JSON.parse(Parameters.getString("smartStretchState")):null;
   var target=Parameters.isViewTarget?Parameters.targetView:null;
   if(!target&&state&&state.viewId)target=View.viewById(state.viewId);
   if(state&&(state.schema!==1||!state.settings||!Array.isArray(state.settings.selections)||!Array.isArray(state.settings.samplePoints)))throw new Error("Invalid Smart Stretch instance.");
   var dialog = new SmartStretchDialog(!!state||Parameters.isViewTarget,target);
   try{if(state){dialog.restoreHistoryState(state.settings);dialog.commitHistory();}if(Parameters.isViewTarget)dialog.applyToExternalImage();else STScreenFit.execute(dialog);}
   finally{dialog.clearQuickNebulosityGuide();dialog.adjustmentClosed=true;dialog.stopAdjustmentPreview();if(dialog.autoContrastCache)dialog.autoContrastCache.map.free();SmartTools.closeWindowPool(dialog.previewNativePool);if(dialog.hdrMeanCache)dialog.hdrMeanCache.image.free();SmartMaskEngine.clearCache();SmartTools.closeWindowPool(dialog.nativeWorkspace);SmartTools.closeWindowPool(dialog.nativeQuickWorkspace);SmartTools.closeWindowPool(dialog.nativeQuickFaintWorkspace);}
}

#ifndef SST_EMBED_QUICK
main();
#endif
