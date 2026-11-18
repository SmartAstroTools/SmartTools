// Standalone PixInsight script. Rename SmartStretchTrainer.txt to SmartStretchTrainer.js before running.
/* Smart Tools screen fitting 1.0.1 (2026-10-30).
 * All geometry stays in native Control pixels. Do not divide screen geometry
 * by the DPI ratio: availableScreenRect and Control dimensions share units.
 * Preview display sizes change; processing constants and recipes do not.
 */
var STScreenFit = typeof STScreenFit === "undefined" ? {} : STScreenFit;
STScreenFit.version = "1.0.1";
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
// A real child control holds the layout. The viewport itself has no sizer,
// so its document's minimum dimensions never force the outer window larger.
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
   if(typeof console!="undefined" && console.writeln)
      console.writeln("[Smart Tools Screen Fit 1.0.1] "+Math.round(b.width)+"x"+Math.round(b.height)+" available; window "+d.width+"x"+d.height+(b.fallback?" (conservative fallback)":""));
};
// Constructors build _stBody without assigning it to a native control. These
// entry points install the completed body before layout or modeless display.
STScreenFit.adjust = function(d){
   if(d instanceof Dialog && d._stBody){
      STScreenFit.install(d);
      d.ensureLayoutUpdated();STScreenFit.limit(d,false);
      return d;
   }
   return d.adjustToContents();
};
STScreenFit.show = function(d){
   if(d instanceof Dialog)STScreenFit.install(d);
   return d.show();
};
STScreenFit.execute = function(d){
   if(d instanceof Dialog)STScreenFit.install(d);
   return d.execute();
};

#include <pjsr/ColorSpace.jsh>
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

// FITS2: embed original linear measurements and working statistics with recipe; stretch equations unchanged.
/* October 12, 2026 build: paired-M42 reference calibration, bounded highlight tradeoff,
   brighter reference-like HDR candidates in existing slots; galaxy paths unchanged.
   Local tests use area-averaged FITS proxies; PixInsight runtime retest required. */
/* STANDALONE TRAINER 0.5.4. Rename this one .txt file to .js.
 * All local helpers and Quick Stretch are bundled. No other source files needed.
 * Automatic heuristic tournament advances once on each Choose selected click.
 * Blind Labels defaults ON; quality badges and recipe details are hidden. New sessions
 * compare both winners before creating output. Both paths are saved in JSON.
 * Fixes reported block-function and SSTChoose return warnings.
 */
#feature-id Utilities > Smart Stretch Trainer
#feature-info Experimental preference-guided stretch tournament. Creates new images only.
// Run full-resolution work once the modal progress dialog has painted.
function SATRunProgress(title, work, requestCancel){
   var dialog = new Dialog;
   dialog.windowTitle = title;
   var message = new Label(dialog);
   message.setMinWidth(380);
   var bar = new Control(dialog);
   bar.setFixedHeight(22);
   var percent = 0, finished = false, failed = false, failure;
   bar.onPaint = function(){
      var graphics = new Graphics(this);
      try{
         graphics.fillRect(0, 0, this.width, this.height, new Brush(0xff252525));
         graphics.fillRect(0, 0, Math.round(this.width*percent/100), this.height, new Brush(0xff398bd4));
      }finally{graphics.end();}
   };
   dialog.sizer = new VerticalSizer;
   dialog.sizer.margin = 12;
   dialog.sizer.spacing = 8;
   dialog.sizer.add(message);
   dialog.sizer.add(bar);
   message.text = "Preparing full-resolution image… (0%)";
   var cancel = null;
   if(requestCancel){
      cancel = new PushButton(dialog);
      cancel.text = "Cancel";
      cancel.onClick = function(){
         cancel.enabled = false;
         message.text = "Cancelling…";
         requestCancel();
      };
      dialog.sizer.add(cancel);
   }
   function report(value, stage, lockCancel){
      if(cancel && lockCancel) cancel.enabled = false;
      percent = Math.max(percent, Math.min(100, value));
      message.text = stage + " (" + Math.round(percent) + "%)";
      bar.update();
      processEvents();
   }
   function rejectClose(){
      if(!finished && cancel && cancel.enabled) cancel.onClick();
   }
   dialog.onClose = function(){rejectClose();return finished;};
   var timer = new Timer;
   timer.interval = 0.05;
   timer.periodic = false;
   timer.onTimeout = function(){
      timer.stop();
      try{
         work(report);
         report(100, "Complete", true);
      }catch(error){failed = true;failure = error;}
      finally{finished = true;dialog.ok();}
   };
   dialog.onShow = function(){timer.start();};
   dialog.adjustToContents();
   try{STScreenFit.execute(dialog);}finally{timer.stop();}
   if(failed) throw failure;
}

#include <pjsr/UndoFlag.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#define SST_EMBED_QUICK
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


#define VERSION "0.5.31.2"

#include <pjsr/Sizer.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/ButtonCodes.jsh>
#include <pjsr/TextAlign.jsh>
/* Performance build 0.2.1: exact-checked bounded cache, bulk planes, two growth buffers. */
/* Installation: download this .txt source and rename it to .js locally.
 */

/* SmartTools 0.5.1 — shared PixInsight PJSR utilities.
 * Embedded suite utilities.
 * Adds native selection-mask expressions and Color Mapper helpers for
 * SmartCurvesTransform.js; existing Stretch/Mask/Star functions are unchanged.
 */
var SmartTools = typeof SmartTools === "undefined" ? {} : SmartTools;

// Common display size for Smart Stretch, both Smart Mask dialogs and Star Stretch.
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


SmartTools.configurePixelMath=function(p,bits){
   p.clearImageCacheAndExit=false;p.cacheGeneratedImages=false;
   p.generateOutput=true;p.singleThreaded=false;p.optimization=true;
   p.use64BitWorkingImage=bits!==32;p.createNewImage=false;
   p.rescale=false;p.truncate=true;p.truncateLower=0;p.truncateUpper=1;
   return p;
};


// Exact parameter preparation removes pow/asinh/clamp work from pixel loops.
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
// LUTs are opt-in per cell, with exact evaluation for steep/unsafe cells.
// Validate quarter/mid/three-quarter interpolation AND gain error: RGB scales
// amplify errors at low signal. This is empirical validation, not a proof.
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


// Shared box mean keeps the original clipped-edge summed-area behavior.
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

// Use the process default identity STF; do not assume View.stf row ordering.
// This changes display transfer only, never the committed image samples.
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

// Hidden native workspace, owned by one dialog. Never pool the external view.
// One slot per purpose bounds memory; shape/precision changes close old slots.
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
// Nonuniform native LUT coordinate: fourth-root distance to the symmetry point.
// Dense knots around SP avoid the large errors of a uniform linear-signal LUT.
// Seven interior probes per cell gate the complete table; a failed table is
// never used. This is empirical validation, not a mathematical error proof.
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

// These helpers are for private, disposable windows only. The external target
// always keeps its ordinary Undo-enabled beginProcess()/endProcess() transaction.
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

// Piecewise uniform gain lookup: affine indexing within each segment.
// Refine near high curvature without a per-pixel nonlinear coordinate map.
// Seven probes per cell gate admission; native preflight/validation remain mandatory.
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

// Keep NumericControl's evaluate(), precision, range checks and slider mapping.
// Text commits only on blur; never connect onTextUpdated to processing.
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

/* Smart Curves additions: existing Stretch/Mask/Star entry points unchanged. */


// Source is an explicit original-image identifier, never the transformed target.
// All operations use the same 12% smooth edges / normalized RGB metric as Stretch.


// Explicit full rectangle/channel avoids dependence on current Image selections.
SmartTools.readPlane=function(im,ch){var a=[];
   if(typeof im.getSamples=="function")im.getSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)a.push(im.sample(x,y,ch));
   if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");return a;
};
SmartTools.writePlane=function(im,a,ch){if(a.length!=im.width*im.height)throw new Error("Bulk plane geometry mismatch");
   if(typeof im.setSamples=="function")im.setSamples(a,new Rect(0,0,im.width,im.height),ch);
   else for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++)im.setSample(a[y*im.width+x],x,y,ch);
};

/*
 * SmartMaskEngine.txt
 * Shared Smart Mask detection engine for Smart Stretch and standalone Smart Mask.
 * Version 0.2.0
 *
 * Input images are expected to be RGB or grayscale PixInsight Image objects.
 * Returned masks are grayscale Image objects with values in [0,1].
 */

function SmartMaskEngine()
{
}

SmartMaskEngine.cache=null;
SmartMaskEngine.percentile = SmartTools.percentile;

// Array-backed detector buffers eliminate per-pixel native API crossings.
function SMEBuffer(w,h){if(typeof w=="object"){this.width=w.width;this.height=w.height;this.data=w.data.slice();}
   else{this.width=w;this.height=h;this.data=new Array(w*h);for(var i=0;i<this.data.length;i++)this.data[i]=0;}}


 // JS arrays are collected; cached planes remain owned by the cache.
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


/*
 * Structure-aware detection.
 *
 * Bright cores are deliberately compressed: once a pixel is confidently part
 * of the object, additional brightness contributes little additional mask
 * weight. Faint wisps are detected from broad/local-background residuals and
 * then admitted preferentially when connected to confident object structure.
 */
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
   var bg=prepared.stats.bg;
   var p50=prepared.stats.p50;
   var p70=prepared.stats.p70;
   var noise=Math.max(1.0e-5,Math.max((p70-bg)/1.45,(p50-bg)/0.75));

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
         var z=(sm-seedThreshold)/Math.max(noise,1.0e-5);
         var core=z>0 ? 1-Math.exp(-0.85*z) : 0;
         core=Math.min(0.82,core); // core is an anchor, not a dominant white blob

         // Local-background residuals recover diffuse structure even when its
         // absolute level is far below the bright core.
         var broadZ=(mm-Math.max(bg,lm))/Math.max(noise,1.0e-5);
         var broad=Math.max(0,Math.min(1,(broadZ+0.15)/(1.8-1.25*wisps)));
         var absoluteFaint=Math.max(0,Math.min(1,(mm-faintThreshold)/
            Math.max(noise*(2.4-1.2*wisps),1.0e-5)));
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

// Adaptive mode uses robust median/MAD background statistics. Legacy remains
// available as an exact baseline for visual A/B testing.
SmartMaskEngine.generate = function(src,options,progress)
{
   options=options||{};
   var t0=new Date().getTime(),t=t0;
   function mark(name)
   {
      var now=new Date().getTime();
      console.writeln("[Smart Mask] "+name+": "+((now-t)/1000).toFixed(3)+" s");
      t=now;
   }
   if(options.algorithm=="legacy")
   {
      var old=SmartMaskEngine.generateLegacy(src,options,progress);
      mark("Legacy detection");
      return old;
   }
   var result=SmartMaskEngine.generateLegacy(src,options,progress),prepared=SmartMaskEngine.cache;
   mark("Multiscale structure and connected-wisp detection");
   var W=src.width,H=src.height,step=Math.max(1,Math.ceil(Math.sqrt(W*H/50000))),stats=prepared.robust;
   if(!stats){var vals=[];for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step){var v=prepared.lum.data[y*W+x];if(isFinite(v))vals.push(v);}
      var median=SmartMaskEngine.percentile(vals,.5),dev=[];for(var i=0;i<vals.length;i++)dev.push(Math.abs(vals[i]-median));
      stats=prepared.robust={median:median,noise:Math.max(1e-5,1.4826*SmartMaskEngine.percentile(dev,.5)),bg:SmartMaskEngine.percentile(vals,.22),count:vals.length};}
   var median=stats.median,noise=stats.noise,bg=stats.bg;
   mark("Robust statistics cache");
   // Confidence gating: suppress isolated low-confidence background,
   // while retaining connected faint wisps already found by the detector.
   var threshold=Math.max(0.015,Math.min(0.11,0.035+0.015*
      (0.5-(options.sensitivity===undefined?0.55:options.sensitivity))));
   var mask=result.mask;
   var pixels=SmartTools.readPlane(mask,0);for(var i=0;i<pixels.length;i++)if(pixels[i]<threshold)pixels[i]=pixels[i]*pixels[i]/threshold;SmartTools.writePlane(mask,pixels,0);
   mark("Adaptive confidence cleanup");
   result.robustMedian=median;
   result.robustNoise=noise;
   result.background=bg;
   result.algorithm="adaptive";
   console.writeln("[Smart Mask] median="+median.toFixed(6)+
      " MADsigma="+noise.toFixed(6)+" background="+bg.toFixed(6)+
      " samples="+stats.count+" total="+((new Date().getTime()-t0)/1000).toFixed(3)+" s");
   return result;
};


// ----------------------------------------------------------------------------
// Histogram control
// ----------------------------------------------------------------------------

function HistogramControl( parent )
{
   this.__base__ = Control;
   this.__base__( parent );

   var self = this;

   this.bins = [];
   this.maximum = 1;
   this.ranges = [ { center:0.5, low:0.0, high:1.0 } ];
   this.onSignalClicked = null;
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
               if(this.selectionMode!="symmetry")
                  for ( var r = 0; r < this.ranges.length; ++r )
                     if ( this.ranges[r].type!="symmetry" &&
                          v >= this.ranges[r].low && v <= this.ranges[r].high )
                     {
                        selected = true;
                        break;
                     }

               var nc=0xff606060, sc=0xffc8c8c8;
               if(this.channelMode=="R"){nc=0xff902828;sc=0xffff6060;}
               else if(this.channelMode=="G"){nc=0xff287828;sc=0xff60ff60;}
               else if(this.channelMode=="B"){nc=0xff303090;sc=0xff7070ff;}
               g.fillRect(x,y,x+1,bottom,new Brush(selected?sc:nc));
            }
         }

         // Selection ranges remain in true 0..1 signal coordinates.
         for ( var q = 0; q < this.ranges.length; ++q )
         {
            var range = this.ranges[q];
            var dlo = Math.max( range.low, z0 );
            var dhi = Math.min( range.high, z1 );

            if ( this.selectionMode!="symmetry" && range.type!="symmetry" &&
                 dhi >= dlo )
            {
               var lx = Math.round( (dlo-z0)/zs*w );
               var hx = Math.round( (dhi-z0)/zs*w );
               if ( hx > lx )
                  g.fillRect( lx, 0, hx, bottom, new Brush( 0x2030a0ff ) );

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

// GHS-inspired localization of the nonlinear stretch. Local Intensity chooses
// the signal level where Stretch Factor has maximum influence. The neutral
// value 0.5 preserves the established Smart Stretch curve.
function symmetryPointStretchValue( v, stretch, sp, localIntensity )
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
      return base;

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

   return v+locality*(base-v);
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

function SmartStretchDialog(trainerWinnerMode)
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
   this.colorTolerance = 0.10;
   this.channelMode = "RGBK";

   this.preview.viewport.onPaint = function( x0, y0, x1, y1 )
   {
      var g = new Graphics( this );

      try
      {
         g.fillRect( x0, y0, x1, y1, new Brush( 0xff101010 ) );

         if ( self.previewBitmap != null )
            g.drawBitmap( 0, 0, self.previewBitmap );
         // Smart Mask overlay is rendered explicitly in the main preview,
         // including AS. Selection Mask remains the master show/hide switch.
         if(self.selectionMask_CheckBox!=null &&
            self.selectionMask_CheckBox.checked &&
            self.smartMask!=null && self.previewBitmap!=null)
         {
            var mw=self.smartMask.width,mh=self.smartMask.height;
            var dx=self.previewBitmap.width/mw,dy=self.previewBitmap.height/mh;
            // Draw small translucent magenta cells. This avoids blackening
            // unselected pixels and keeps the overlay registered at any scale.
            for(var my=0;my<mh;++my)
               for(var mx=0;mx<mw;++mx)
               {
                  var ma=self.smartMask.sample(mx,my,0);
                  if(ma<0.02)continue;
                  var alpha=Math.max(12,Math.min(150,Math.round(150*ma)));
                  var color=(alpha<<24)|0x00ff00ff;
                  g.fillRect(Math.floor(mx*dx),Math.floor(my*dy),
                     Math.ceil((mx+1)*dx),Math.ceil((my+1)*dy),
                     new Brush(color));
               }
         }

         // Stage 5.8.0 signal-range overlay. The luminance map is already reduced
         // to preview dimensions, so this never scans the full-resolution
         // image during painting.
         if ( self.selectionMode!="symmetry" &&
              self.overlayEnabled && self.overlayImage != null )
         {
            var ow = self.overlayImage.width;
            var oh = self.overlayImage.height;
            var step = 2;

            for ( var oy = 0; oy < oh; oy += step )
               for ( var ox = 0; ox < ow; ox += step )
               {
                  var maskValue = self.processingMask != null ?
                     self.processingMask.sample( ox, oy, 0 ) : 0;

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

      // Mouse events are already delivered in the preview viewport's bitmap
      // coordinate system for this custom ScrollBox. Do not add scroll offsets;
      // doing so displaces the lasso polygon away from the visible outline.
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
      "Show or hide pixels whose luminance falls inside the selected histogram range.";

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
         channelMode:self.channelMode,
         lassoActive:self.lassoActive,
         lassoMode:self.lassoMode,
         clickHalfWidth:self.clickHalfWidth,
         colorTolerance:self.colorTolerance,connectedColor:self.connectedColor_CheckBox.checked,faintColorReach:self.faintColorReach_Control.value,
         intensity:self.intensity_Control.value,
         contrast:self.contrast_Control.value,
         stretch:self.stretch_Control.value,
         localIntensity:self.localIntensity_Control.value,
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
      self.connectedColor_CheckBox.enabled=self.selectionMode=="color";self.faintColorReach_Control.enabled=self.selectionMode=="color"&&self.connectedColor_CheckBox.checked;
      self.histogram.setSelectionMode(self.selectionMode);
      for ( var st=0; st<self.selections.length; ++st )
         if ( !self.selections[st].hasOwnProperty("type") )
            self.selections[st].type="signal";
      var spatialLock=self.hasSpatialSelections();
      var colorLock=self.selectionMode=="color";
      var symmetryLock=self.selectionMode=="symmetry";
      var reason=colorLock ?
         (spatialLock ? "Color/Spatial selection active — histogram selection locked"
                      : "Color selection active — histogram selection locked")
         : (spatialLock ? "Spatial selection active — histogram selection locked" : "");
      // Symmetry Point intentionally keeps histogram clicking available.
      self.histogram.setSelectionLocked(colorLock || spatialLock,reason);
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
      if ( self.selectionMode=="color" )
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
      self.overlay_CheckBox.enabled=!symmetryLock;
      self.inverseSelection_CheckBox.enabled=!symmetryLock;
      self.overlayStrength_Control.enabled=!symmetryLock;
      self.lassoEnable_CheckBox.enabled=!symmetryLock;
      self.lassoSubtract_Radio.enabled=!symmetryLock;
      self.lassoKeep_Radio.enabled=!symmetryLock;
      self.lassoClear_Button.enabled=!symmetryLock;

      self.rebuildProcessingMask();
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

   this.rebuildProcessingMask = function()
   {
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

      var connected=null;
      if(self.selectionMode=="color"&&self.connectedColor_CheckBox.checked&&self.workingImage.numberOfChannels>=3){
         var regions=[];for(var ci=0;ci<self.selections.length;ci++){var cs=self.selections[ci];if(self.selectionType(cs)!="color")continue;var cq={type:"color",r:cs.r,g:cs.g,b:cs.b,tolerance:cs.tolerance};if(cs.spatial&&cs.spatialMask){cq.seedMask=cs.spatialMask;}regions.push(cq);}
         connected=SCCBuild(self.workingImage,regions,self.faintColorReach_Control.value);
      }

      for ( var y = 0; y < H; ++y )
         for ( var x = 0; x < W; ++x )
         {
            var v = self.overlayImage.sample( x, y, 0 );
            var best = 0;
            var bestWidth = 2*self.clickHalfWidth;

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
   this.quickFaintPass=function(src,parameters){var out=new Image(src),C=src.numberOfChannels,params=parameters||self.basicStretchFaintParameters;
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
            var num=function(v){return Number(v).toPrecision(17);};
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

   this.chooseQuickStretch=function(a){var chosen=-1,bitmap=null,parameters=null,busy=false,closed=false,lastKey="",pool={},nativeUses=0;
      var nativeAvailable=typeof HistogramTransformation!="undefined"&&typeof PixelMath!="undefined";
      var timer=new Timer;timer.interval=.12;timer.periodic=false;
      var src=self.sourceWorkingImage,base=self.analyzeQuickFaintParameters(src),d=new Dialog;
      if(self.trainerWinnerMode)for(var bc=0;bc<base.length;bc++)base[bc]={black:0,midtones:.5};d.windowTitle="Quick Stretch";
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
      var linear=new CheckBox(d);linear.text=STHoverCaption(linear,"Linear black / white",0);linear.checked=!self.trainerWinnerMode;
      linear.toolTip="Stretch the current preview's minimum to black and maximum to white. Full Apply recalculates full-resolution extrema.";
      var highContrast=new CheckBox(d);highContrast.text=STHoverCaption(highContrast,"Auto High Contrast",0);highContrast.checked=!self.trainerWinnerMode;
      highContrast.toolTip="Enhance eligible low-contrast structure in the preview and selected Quick Stretch workflow.";
      var nebula=new CheckBox(d);nebula.text=STHoverCaption(nebula,"Faint Nebulosity (experimental second pass)",0);nebula.checked=self.quickNebulosityEnabled;
      nebula.toolTip="Lift connected faint structure using the original reduced image; protects dark background, stars and highlights. Off by default.";
      var nebulaStrength=new NumericControl(d);nebulaStrength.label.text=STHoverCaption(nebulaStrength,"Faint Nebulosity Strength",2);
      nebulaStrength.setRange(0,1);nebulaStrength.slider.setRange(0,1000);nebulaStrength.setPrecision(2);
      nebulaStrength.setValue(self.quickNebulosityStrength);nebulaStrength.enabled=nebula.checked;
      SmartTools.configureNumericInput(nebulaStrength);
      var colorEnhance=new CheckBox(d);colorEnhance.text=STHoverCaption(colorEnhance,"Auto Color & Brightness (experimental)",0);
      colorEnhance.checked=self.autoColorBrightnessEnabled;
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
      reset.onClick=function(){timer.stop();slider.value=50;linear.checked=!self.trainerWinnerMode;highContrast.checked=!self.trainerWinnerMode;nebula.checked=false;nebulaStrength.setValue(.35);nebulaStrength.enabled=false;colorEnhance.checked=false;brightnessStrength.setValue(.35);vibranceStrength.setValue(.25);brightnessStrength.enabled=vibranceStrength.enabled=false;refresh();};
      var cancel=STHoverAttach(new PushButton(d),"Cancel this dialog or request cancellation of the current operation.");cancel.text=STHoverCaption(cancel,"Cancel",0);cancel.onClick=function(){timer.stop();d.cancel();};
      var buttons=new HorizontalSizer;buttons.spacing=6;buttons.add(reset);buttons.addStretch();buttons.add(ok);buttons.add(cancel);
      var info=new Label(d);info.text="STF-style RGB curves can clip shadows and change color balance. OK selects this Quick Stretch; full-image Apply remains manual.";info.wordWrapping=true;
      d._stBody=new VerticalSizer;d._stBody.margin=10;d._stBody.spacing=8;d._stBody.add(panel);d._stBody.add(controls);d._stBody.add(info);d._stBody.add(buttons);d._stFooter=buttons;
      try{refresh();STScreenFit.adjust(d);STScreenFit.execute(d);if(chosen>=0){self.basicStretchFaintParameters=parameters;self.quickNebulosityEnabled=nebula.checked;self.quickNebulosityStrength=nebulaStrength.value;self.autoColorBrightnessEnabled=colorEnhance.checked;self.autoBrightnessStrength=brightnessStrength.value;self.autoVibranceStrength=vibranceStrength.value;self.autoColorBrightness_Button.text=STHoverCaption(self.autoColorBrightness_Button,colorEnhance.checked?"Remove Color & Brightness":"Auto Color & Brightness",0);self.autoHighContrastEnabled=highContrast.checked;self.autoHighContrast_Button.text=STHoverCaption(self.autoHighContrast_Button,highContrast.checked?"Remove High Contrast":"Auto High Contrast",0);}return chosen;}
      finally{closed=true;timer.stop();bitmap=null;var closeStart=SmartTools.now();SmartTools.closeWindowPool(pool);console.writeln("[Quick Stretch Preview] Close cleanup="+((SmartTools.now()-closeStart)/1000).toFixed(3)+" s");}
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

      self.preview.viewport.setFixedSize(
         self.previewBitmap.width, self.previewBitmap.height );
      self.preview.viewport.update();

      self.status_Label.text =
         ("Quick Stretch"+(self.quickNebulosityEnabled?" + faint nebulosity":"")+(self.basicStretchLinearEnabled?" + linear endpoints":"")+": black=") + self.basicStretchBlack.toFixed(5) +
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
      self.stretchCurveCache=null;
      if(self.localMeanCache!=null)
      {
         self.localMeanCache.free();
         self.localMeanCache=null;
      }
      self.localMeanCacheChannel="";
   };

   this.getStretchEvaluator=function(stretch,sp,li,symmetry)
   {
      if(self.exactReferencePass)return function(v){return symmetry?
         symmetryPointStretchValue(v,stretch,sp,li):localizedStretchValue(v,stretch,li);};
      var key=[stretch,sp,li,symmetry].join("|");
      if(self.stretchCurveCache==null || self.stretchCurveCache.key!=key)
      {
         var t=SmartTools.now();
         var exact=SmartTools.prepareStretch(stretch,sp,li,symmetry);
         var curve=stretch<=0?exact:SmartTools.stretchLUT(exact);
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
      return self.selectionMode=="symmetry" &&
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
      var key=[sp,strength,li,intensity,shadows,highlights].join("|");
      if(self.nativeTableCache && self.nativeTableCache.key==key)return self.nativeTableCache.table;
      var start=SmartTools.now(),curve=SmartTools.prepareStretch(strength,sp,li,true);
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
      var parameterKey=[self.committedSP,self.stretch_Control.value,self.localIntensity_Control.value,
         self.intensity_Control.value,self.protectShadows_Control.value,self.protectHighlights_Control.value].join("|");
      var key=[parameterKey,source.numberOfChannels,self.channelMode,lo,hi].join("|");
      if(self.nativeContext && self.nativeContext.key==key){
         self.nativeContext.source=source;return self.nativeContext;
      }
      var sp=Math.max(0.000001,Math.min(0.999999,self.committedSP));
      var curve=SmartTools.prepareStretch(0.5*self.stretch_Control.value,sp,self.localIntensity_Control.value,true);
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
            var transformed=symmetryPointStretchValue(signal,strength,self.committedSP,li);
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
            if(!self.exactReferencePass && src.isReal!==false && typeof PixelMath!="undefined" && (C==1||C==3))
               try{base=self.processNativeQuick(src,false);nativeQuickOK=true;}
               catch(quickError){console.warningln("[Smart Stretch Apply] Native Quick baseline rejected; using exact JavaScript: "+quickError);}
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
         "basicStretch_Button","autoHighContrast_Button","autoColorBrightness_Button","zoomToPeak_Button","resetHistogramZoom_Button",
         "rgbkChannel_Radio","rChannel_Radio","gChannel_Radio","bChannel_Radio",
         "symmetryMode_Radio","signalMode_Radio","colorMode_Radio",
         "colorTolerance_Control","connectedColor_CheckBox","faintColorReach_Control","low_Control","high_Control",
         "width_Control","stretch_Control","intensity_Control",
         "contrast_Control","localIntensity_Control",
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
      var exact=function(v){return symmetry?symmetryPointStretchValue(v,strength,self.committedSP,li):localizedStretchValue(v,strength,li);};
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
         " | stretch="+self.stretch_Control.value.toFixed(3)+
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
      var mv=mask?mask:(self.selectionMode=="symmetry"?"1":"0"),rw=self.selectionMode=="symmetry"?"1":range?range:n(2*self.clickHalfWidth);
      code+="ssN=min(1,max(0,ssC+"+(mean?n(Math.pow(2,self.contrast_Control.value)-1)+"*(ssV-"+mean+")":"0")+"+"+n(.875*self.intensity_Control.value)+"*("+rw+")));ssF=1;";
      code+="ssD=min(1,max(0,ssV*4));ssF=ssF*(1-"+n(self.protectShadows_Control.value)+"*(1-ssD*ssD*(3-2*ssD)));";
      code+="ssD=min(1,max(0,(ssV-.75)*4));ssF=ssF*(1-"+n(self.protectHighlights_Control.value)+"*ssD*ssD*(3-2*ssD));ssN=ssV+("+mv+")*ssF*(ssN-ssV);";
      var expressions=[];for(var c=0;c<src.numberOfChannels;c++){var original=rgb?"$T["+c+"]":"$T";
         expressions.push(rgb&&sel!=null&&sel!=c?original:code+"iif(("+mv+")<=1e-8,"+original+",("+(rgb&&sel==null?"min(1,max(0,"+original+"*iif(ssV>1e-8,ssN/max(1e-8,ssV),1)))":"ssN")+"))");}
      var proc=SmartTools.configurePixelMath(new PixelMath,64);proc.symbols="ssV,ssP,ssZ,ssC,ssD,ssN,ssF";proc.useSingleExpression=!rgb;
      proc.expression=expressions[0];if(rgb){proc.expression1=expressions[1];proc.expression2=expressions[2];}
      if(!proc.executeOn(w.mainView,false))throw new Error("Native preview PixelMath failed");self.logApplyStage("Preview: native upload / exact pixel pass",t);t=SmartTools.now();
      var exact=SmartTools.prepareStretch(strength,sp,li,useSymmetry),maxError=0,count=0;
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

         self.preview.viewport.setFixedSize(
            self.previewBitmap.width, self.previewBitmap.height );
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
   this.newInstance_Button.icon = new Bitmap( ":/images/interface/dragObject.png" );
   this.newInstance_Button.setFixedSize( 24, 24 );

   this.apply_Button = STHoverAttach(new ToolButton( this ),"Apply the current adjustments to the full-resolution source image. PixInsight Undo is available.");
   this.apply_Button.toolTip =
      "Apply the current Smart Stretch preview settings.";
   this.apply_Button.setFixedSize( 28, 28 );
   this.apply_Button.onPaint = function( x0, y0, x1, y1 )
   {
      var g=new Graphics(this);
      try
      {
         g.fillRect(0,0,this.width,this.height,new Brush(0x00000000));
         // Green check mark: Apply current changes.
         g.pen=new Pen(0xff36a852,3);
         g.drawLine(5,14,11,20);
         g.drawLine(11,20,23,7);
      }
      finally { g.end(); }
   };

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
         self.preview.viewport.setFixedSize(
            self.previewBitmap.width, self.previewBitmap.height );
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
            self.preview.viewport.setFixedSize(
               self.previewBitmap.width,self.previewBitmap.height);
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

   this.newInstance_Button.onClick = function()
   {
      // Preserve a complete settings snapshot. This custom script is still a
      // Dialog-based prototype rather than a registered ProcessImplementation,
      // so the control restores the expected bottom-left workflow affordance
      // without pretending to create a native process icon.
      self.instanceSnapshot=self.captureHistoryState();
      self.status_Label.text=
         "Smart Stretch instance settings captured";
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
      var w = ImageWindow.activeWindow;

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

      var view = w.currentView;

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

         self.preview.viewport.setFixedSize(
            self.previewBitmap.width,
            self.previewBitmap.height
         );

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

   var initialLoaded=self.loadActiveView();
   self.history=[];
   this.historyIndex=-1;
   this.commitHistory();
   this.trainerWinnerMode=!!trainerWinnerMode;
   if(initialLoaded&&!this.trainerWinnerMode)
      self.offerQuickStretchIfLinear();

   // Focus-loss text commits; sliders retain immediate native updates.
   var numericInputs=[this.low_Control,this.high_Control,this.width_Control,this.overlayStrength_Control,this.colorTolerance_Control,this.intensity_Control,this.contrast_Control,this.stretch_Control,this.localIntensity_Control,this.protectShadows_Control,this.protectHighlights_Control,this.adaptiveBoundary_Control,this.hdrStrength_Control,this.hdrScale_Control];
   for(var ni=0;ni<numericInputs.length;++ni)SmartTools.configureNumericInput(numericInputs[ni]);
   self.channelMode="RGBK";self.selectionMode="symmetry";
   self.rChannel_Radio.checked=false;self.gChannel_Radio.checked=false;self.bChannel_Radio.checked=false;self.rgbkChannel_Radio.checked=true;
   self.signalMode_Radio.checked=false;self.colorMode_Radio.checked=false;self.symmetryMode_Radio.checked=true;
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

   var dialog = new SmartStretchDialog;
   try{STScreenFit.execute(dialog);}
   finally{dialog.clearQuickNebulosityGuide();dialog.adjustmentClosed=true;dialog.stopAdjustmentPreview();if(dialog.autoContrastCache)dialog.autoContrastCache.map.free();SmartTools.closeWindowPool(dialog.previewNativePool);if(dialog.hdrMeanCache)dialog.hdrMeanCache.image.free();SmartMaskEngine.clearCache();SmartTools.closeWindowPool(dialog.nativeWorkspace);SmartTools.closeWindowPool(dialog.nativeQuickWorkspace);SmartTools.closeWindowPool(dialog.nativeQuickFaintWorkspace);}
}

#ifndef SST_EMBED_QUICK
main();
#endif

/* Smart Stretch Trainer 0.4.2, 2026-10-10.
   0.4.2: short, status-first recommendation buttons; quality status stays
   visible with Blind labels (which now hides method names only).
   0.4.1: replace upload browser conditional with nested #ifdef branches.
   0.4.0: image-dependent named scenarios, deterministic axis refinement,
   regional duplicate screening, measured quality recommendations, automatic
   native winner handoff to Quick Stretch with identity starting transform.
   Recommendations are local heuristics, not live AI judgments. Requires
   the bundled Smart Stretch code.
   0.3.1: export completed sessions to a unique JSON file and open Don's
   Dropbox File Request. Browser upload is manual; no image pixels included.
   0.2.1: 476 x 272 grid tiles; click any tile for a 1200 x 800 detail viewer.
   Candidate buttons select without opening the viewer. Choose selected commits.
   0.3.0: versioned native-source image descriptors (sampled highlight tails,
   clipping, background/noise estimates, 8x6 regional map, RGB balance),
   optional data/star labels, winning working-preview descriptor. Older JSON
   remains compatible. Load old JSON, select its original linear main image,
   choose optional labels and click Update saved measurements, then Save.
   Sampling is bounded; rare highlights can be missed. Background/noise are
   heuristics. Working-preview measurements are not native-output measurements.
   Existing stretch equations and tournament generation remain unchanged.
   0.2.3: automatically open the final winner in the large viewer, then
   show its explanation when the viewer is closed.
   0.2.2: explicit Quick lineage; evenly spaced refinement variations, final
   brightness gamma, pixel-difference checks and adaptive range widening.
   New sessions use refinement algorithm 2; old sessions retain algorithm 1.
   0.2.1: automatic final-choice explanation; reopen with Explain choice.
   0.2.0: full default Quick pipeline; shortlist 1-3; three refinement grids
   per branch; deterministic replay/save/resume/undo; final branch comparison.
   Guide: select nine group winners, toggle 1-3 finalists, Begin refinement.
   Each refinement grid keeps its parent and offers eight small variations.
   Three successive grids per branch, then choose among 2/3 branch winners.
   Quick baseline uses current defaults: STF, linked endpoints, Auto High
   Contrast; optional Faint Nebulosity and Color/Brightness remain disabled.
   Standalone: no Smart Suite includes and no changes to existing tools.
   Float image math; previews are rendered only after processing.
   Saved preferences gently bias candidates and rank previews; this is not a neural network.
*/
/* 0.5.6: guarded optional preference fields for older JSON / PJSR strict warnings.
   0.5.5: frozen, source-matched preference model for candidate generation and
   both recommendation paths. Load saved preferences before Start / resume.
   Completed sessions only; repeated sources count once. Quality warnings retain
   priority. Nine families, Quick baseline and tournament flow are preserved. */
/* 0.5.7: native-size output progress dialog, including finishing passes and
   output-window copy; closes on success or error. Stretch math unchanged. */
/* 0.5.8: source-based extended-core HDR detection; linked peak HDR curves with
   separate background, midtone and highlight anchors; HDR-aware recommendations.
   Existing sessions retain their recipes. Start a new session for HDR candidates.
   Quick baseline, blind labels, on-choice recommendations and progress unchanged. */
/* 0.5.9: conservative concentrated-core HDR gate. A wide signal range alone
   no longer enables HDR candidates or HDR-specific recommendation bonuses.
   Broad emission nebulae retain ordinary candidate generation. */
/* 0.5.10: HDR shoulder contrast and luminance-preserving, gamut-limited color
   enhancement; spatial core contrast scoring. Non-HDR math and detector unchanged.
   New HDR recipes use version 2; version 1 recipes replay unchanged. */
/* 0.5.11: conservative linked endpoint finishing for elevated/compressed
   candidates, persisted in recipes and applied after gamma at every resolution.
   Compact-source visibility support. Existing recipes and Quick stay unchanged. */
/* 0.5.12: compact-object channel MTF protection and object washout scoring.
   Protection requires compact signal and no HDR core; other generation paths
   and Quick baseline remain unchanged. Saved legacy recipes retain their math. */
/* 0.5.13: lazy per-grid endpoint preparation and compact-object intermediate
   brightness choices. Cached finalized recipes persist through save/resume.
   No all-81 sample fitting at Start. Separate profile JSON remains planned. */
/* 0.5.61: SHO background calibration before linked curves; narrowband visibility,
   flatness and color-collapse checks. Broadband and existing saved recipes retained. */
/* 0.5.61: Balance SHO emission amplitudes before linked curves; measure green
   dominance, saturation excess, and hue concentration in recommendation scoring. */
/* 0.5.61: SHO ratio-preserving soft highlight shoulder, gentler final contrast,
   initial-grid 50/50 channel/linked alternatives; explicit channel-clipping warnings. */
/* 0.5.61: Completed Elephant SHO built-in preference; transfer learned blend
   finishing only; conservative SHO channel candidates replace gray zero-black slots. */
var SST_VERSION="0.5.61";
/* 0.5.31: Remove unavailable FITSKeyword.jsh include; FITSKeyword is a built-in PJSR class. */
/* 0.5.30: Phase 1 optional final Auto High Contrast (off/mild/full), persisted and replayed at native resolution. */
/* 0.5.29: M42 paired-reference preference for similar broadband HDR nebulae; galaxy scoring unchanged. */
/* 0.5.27: Persistent gradient results, broad/local checks, background/noise/color scoring, settings-only Blind labels, safe optional replay fields. */
/* 0.5.26: Phase progress, truly blind labels, no Undo UI, adaptive refinement range, identical-winner shortcut, advisory linear gradient check/correction handoff. */
/* 0.5.25: Default new-session Stars selection to Starless. */
/* 0.5.24: Remove optional reference-image list, display button and handler. */
var SST_UPLOAD_URL="https://www.dropbox.com/request/0shbzrz80nrhf4kcz8x6";
var SST_TARGETS=["Mixed bright / faint nebula","Faint filaments / Spaghetti","Emission nebula","Reflection / dust nebula","Galaxy","Globular cluster","Open cluster / star field","Planetary nebula","Other"];
var SST_FAMILIES=["Quick STF","Conservative black MTF","Zero black MTF","Linked luminance MTF","Linked luminance asinh","Linked luminance log","Linked luminance gamma","Two-stage luminance MTF","Protected luminance MTF"];
var SST_TARGET_MEDIANS=[.12,.16,.20,.25,.30,.35,.40,.45,.50];
var SST_DATA_KINDS=["Unspecified","Broadband RGB","Broadband mono / luminance","Narrowband mono","Narrowband RGB","SHO","HOO","Other"];
var SST_PALETTES=["Broadband RGB","SHO","HOO"];
var SST_STAR_KINDS=["Unspecified","Stars included","Starless","Stars only"];
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
function SSTValidateDescriptor(d){
 if(!d||d.schema!="smart-stretch-image-descriptor-1"||d.measurementVersion!=1||!(d.channelStatistics instanceof Array)||[1,3].indexOf(d.channels)<0||d.channelStatistics.length!=d.channels||!d.luminance||!d.sampling||!d.clipping||!d.background||!d.noise||!d.spatial||!(d.spatial.regions instanceof Array)||d.spatial.regions.length!=48||d.width<1||d.height<1||d.width%1||d.height%1||d.sampling.sampleCount<1||d.luminance.count!=d.sampling.sampleCount)throw new Error("Invalid image descriptor.");
 function walk(v,depth){if(depth>12)throw new Error("Descriptor nesting is too deep.");if(typeof v=="number"&&!isFinite(v))throw new Error("Nonfinite descriptor value.");if(v&&typeof v=="object"){if(v instanceof Array&&v.length>100)throw new Error("Descriptor array is too large.");for(var k in v)walk(v[k],depth+1);}}
 walk(d,0);
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
// HDR parameters are fixed in source units and reused at native resolution.
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
var SST_GHS_REFERENCE={"version":1,"name":"M31 paired GHS reference","palette":"Broadband RGB","sourceStats":{"luminance":{"median":0.0031018661776557564,"p90":0.005163115330822767,"p99":0.020812958587780615},"red":{"median":0.003128099488094449,"p90":0.005142290610820055,"p99":0.021146257296204674},"green":{"median":0.0030975814443081617,"p90":0.005157549399882555,"p99":0.02075226977467537},"blue":{"median":0.0030975814443081617,"p90":0.005172808654606342,"p99":0.020172426477074623}},"curves":[[[0,0],[0.002609292743727565,0.02252821996808052],[0.002685587853193283,0.02505139261484146],[0.0027161058969795704,0.026141854003071785],[0.002731364918872714,0.026934053748846054],[0.0027466239407658577,0.027435149997472763],[0.0027618829626590014,0.027916600927710533],[0.002777141984552145,0.02841779589653015],[0.0027924010064452887,0.028919359669089317],[0.0028076600283384323,0.02944314479827881],[0.002822919050231576,0.029962625354528427],[0.0028381780721247196,0.03047950379550457],[0.0028534370940178633,0.030984096229076385],[0.002868696115911007,0.03148902207612991],[0.0028839551378041506,0.031979866325855255],[0.0028992141596972942,0.032485123723745346],[0.002914473181590438,0.03299075365066528],[0.0029297322034835815,0.03347673639655113],[0.002944991225376725,0.033955857157707214],[0.002960250247269869,0.03446175903081894],[0.0029755092691630125,0.03496812283992767],[0.002990768291056156,0.03544633835554123],[0.0030060273129493,0.035953763872385025],[0.0030212863348424435,0.03646162524819374],[0.003036545356735587,0.036955561488866806],[0.0030518043786287308,0.037435080856084824],[0.0030670634005218744,0.03793513774871826],[0.003082322422415018,0.03842977061867714],[0.0030975814443081617,0.038940101861953735],[0.0031128404662013054,0.03943559154868126],[0.003128099488094449,0.0399467796087265],[0.0031433585099875927,0.04045133292675018],[0.0031586175318807364,0.04095347225666046],[0.00317387655377388,0.041460633277893066],[0.0031891355756670237,0.041971515864133835],[0.0032043945975601673,0.04247386008501053],[0.003219653619453311,0.04299123212695122],[0.0032349126413464546,0.043491773307323456],[0.0032501716632395983,0.043991781771183014],[0.003265430685132742,0.0445067398250103],[0.0032806897070258856,0.04502211511135101],[0.0032959487289190292,0.045505356043577194],[0.003311207750812173,0.04600265249609947],[0.0033264667727053165,0.04655539616942406],[0.00334172579459846,0.047015439718961716],[0.003356984816491604,0.047494739294052124],[0.0033722438383847475,0.04803181812167168],[0.003387502860277891,0.048795994371175766],[0.003433279925957322,0.04996183328330517],[0.0034943160135298967,0.0519322045147419],[0.003570611122995615,0.05446580797433853],[0.003662165254354477,0.05759149417281151],[0.0037689784076064825,0.06150212697684765],[0.0038910505827516317,0.06579447537660599],[0.004028381779789925,0.07023651525378227],[0.004165713209658861,0.07531455904245377],[0.004333562217652798,0.08096367120742798],[0.0045014116913080215,0.08723824843764305],[0.004699778743088245,0.09420210123062134],[0.004943923093378544,0.10296247527003288],[0.005249103531241417,0.11401144415140152],[0.005615320056676865,0.12788307666778564],[0.0061036087572574615,0.14523915946483612],[0.006698710843920708,0.166754312813282],[0.0073701078072190285,0.19082769006490707],[0.008133058436214924,0.2181861251592636],[0.008957046084105968,0.24816512316465378],[0.009826810099184513,0.2784631550312042],[0.010925459675490856,0.3153327405452728],[0.013031205162405968,0.37303441762924194],[0.016952773556113243,0.4536142945289612],[0.021194782108068466,0.5141270756721497],[0.021324483677744865,0.5146758556365967],[0.021454185247421265,0.5164577960968018],[0.021576257422566414,0.5183060169219971],[0.021713588386774063,0.5205016434192657],[0.021850919350981712,0.5219271183013916],[0.02203402854502201,0.5252744555473328],[0.02217135950922966,0.5252744555473328],[0.02235446684062481,0.5282211005687714],[0.022537576034665108,0.5291674733161926],[0.022682536393404007,0.5308631658554077],[0.022812237963080406,0.5324550569057465],[0.022964827716350555,0.535591185092926],[0.023147936910390854,0.5366584658622742],[0.023254750296473503,0.536712646484375],[0.023392081260681152,0.5392871499061584],[0.0235751885920763,0.5409190058708191],[0.02371251955628395,0.5418338179588318],[0.0238498505204916,0.5434135794639587],[0.0240177009254694,0.5455150008201599],[0.024200808256864548,0.5478162169456482],[0.024399176239967346,0.5502006411552429],[0.024536507204174995,0.5505940020084381],[0.024658579379320145,0.5522347688674927],[0.024818798527121544,0.5542045831680298],[0.024963760748505592,0.5549816787242889],[0.02511635050177574,0.5567644834518433],[0.02523842267692089,0.5583820343017578],[0.02539101243019104,0.5587478280067444],[0.02553597278892994,0.5611801743507385],[0.025741970166563988,0.5621789693832397],[0.025871671736240387,0.5642120540142059],[0.026077669113874435,0.5657418370246887],[0.026291294023394585,0.5683932304382324],[0.026611734181642532,0.5705316364765167],[0.02689402550458908,0.5742942690849304],[0.02722209505736828,0.5769346356391907],[0.027496756985783577,0.5780178904533386],[0.027756160125136375,0.5812526345252991],[0.028122376650571823,0.5847738683223724],[0.02838941104710102,0.5869760811328888],[0.02877088636159897,0.5896678566932678],[0.029083695262670517,0.5925925970077515],[0.029404135420918465,0.5946627557277679],[0.029785610735416412,0.5975701212882996],[0.03016708604991436,0.6014637351036072],[0.030624857172369957,0.6054896116256714],[0.031158922240138054,0.6081466674804688],[0.03147173300385475,0.6124202013015747],[0.0319218747317791,0.6143088340759277],[0.0322880893945694,0.6171259880065918],[0.03309682011604309,0.6229831874370575],[0.03352406993508339,0.626475989818573],[0.033958952873945236,0.6294248998165131],[0.03450064733624458,0.6332480907440186],[0.03504997491836548,0.6376839876174927],[0.035889219492673874,0.6420231759548187],[0.03643854334950447,0.6457900404930115],[0.037064164876937866,0.6498396396636963],[0.03761348873376846,0.6530411243438721],[0.03849088400602341,0.6577531695365906],[0.039162278175354004,0.6614853143692017],[0.0398947112262249,0.6657004654407501],[0.04081788286566734,0.671909749507904],[0.04168001934885979,0.675804615020752],[0.04284733533859253,0.6812313795089722],[0.043793391436338425,0.6865459084510803],[0.04483100771903992,0.6905974447727203],[0.04583810269832611,0.6970981955528259],[0.04712748900055885,0.7006259858608246],[0.048622872680425644,0.7077180445194244],[0.04972152225673199,0.7123323976993561],[0.05136949568986893,0.719150960445404],[0.05274280905723572,0.7254174649715424],[0.05381093919277191,0.7293324172496796],[0.05590905621647835,0.7350305616855621],[0.05719081312417984,0.7408508062362671],[0.059632256627082825,0.7482816576957703],[0.06149385869503021,0.7540464401245117],[0.06336309015750885,0.7584114968776703],[0.06664377823472023,0.7676287591457367],[0.06923781335353851,0.7746245861053467],[0.0720302127301693,0.7807973325252533],[0.07533378899097443,0.7890539765357971],[0.0796520933508873,0.7979507148265839],[0.08274967595934868,0.8038201630115509],[0.0871519036591053,0.8117167353630066],[0.09284351766109467,0.8212714195251465],[0.09874112904071808,0.830305278301239],[0.10504310950636864,0.8389074206352234],[0.11425192654132843,0.8500688970088959],[0.12379644438624382,0.8600618243217468],[0.1365148425102234,0.8719634115695953],[0.15400931239128113,0.8854559361934662],[0.1759060025215149,0.8989369869232178],[0.2061493918299675,0.9135817289352417],[0.24892042577266693,0.9290153384208679],[0.3283054977655411,0.9484743773937225],[0.5827420353889465,0.9776662588119507],[1,1]],[[0,0],[0.002609292743727565,0.022583224810659885],[0.0026550698094069958,0.023915564641356468],[0.002685587853193283,0.02472110092639923],[0.0027008468750864267,0.02539527416229248],[0.0027161058969795704,0.025886664167046547],[0.002731364918872714,0.026386616751551628],[0.0027466239407658577,0.026869943365454674],[0.0027618829626590014,0.027363481000065804],[0.002777141984552145,0.027864964678883553],[0.0027924010064452887,0.028373507782816887],[0.0028076600283384323,0.02887294813990593],[0.002822919050231576,0.029371943324804306],[0.0028381780721247196,0.029861057177186012],[0.0028534370940178633,0.030364658683538437],[0.002868696115911007,0.03086416982114315],[0.0028839551378041506,0.03135988488793373],[0.0028992141596972942,0.0318647064268589],[0.002914473181590438,0.0323699414730072],[0.0029297322034835815,0.03287556767463684],[0.002944991225376725,0.0333816297352314],[0.002960250247269869,0.03388809412717819],[0.0029755092691630125,0.0343911275267601],[0.002990768291056156,0.03490229323506355],[0.0030060273129493,0.035405926406383514],[0.0030212863348424435,0.03590552508831024],[0.003036545356735587,0.03640594333410263],[0.0030518043786287308,0.03692302107810974],[0.0030670634005218744,0.03743240237236023],[0.003082322422415018,0.03794218599796295],[0.0030975814443081617,0.03845241665840149],[0.0031128404662013054,0.038947805762290955],[0.003128099488094449,0.03946357220411301],[0.0031433585099875927,0.03997055068612099],[0.0031586175318807364,0.040484167635440826],[0.00317387655377388,0.04099512845277786],[0.0031891355756670237,0.0414925143122673],[0.0032043945975601673,0.04201197996735573],[0.003219653619453311,0.04251931980252266],[0.0032349126413464546,0.04303336888551712],[0.0032501716632395983,0.04356326907873154],[0.003265430685132742,0.04406752064824104],[0.0032806897070258856,0.044593535363674164],[0.0032959487289190292,0.045116543769836426],[0.003311207750812173,0.045640673488378525],[0.0033264667727053165,0.046166688203811646],[0.00334172579459846,0.046700481325387955],[0.003356984816491604,0.04723416268825531],[0.0033722438383847475,0.04794786870479584],[0.0034180209040641785,0.04945959523320198],[0.0034943160135298967,0.051969561725854874],[0.003570611122995615,0.054887935519218445],[0.003662165254354477,0.057922231033444405],[0.0037689784076064825,0.06161772832274437],[0.0038910505827516317,0.0659935250878334],[0.004028381779789925,0.07067525386810303],[0.004180971998721361,0.07609738409519196],[0.004348821472376585,0.08184947073459625],[0.0045166704803705215,0.08797179162502289],[0.004715037997812033,0.09502581506967545],[0.004959182348102331,0.10390546172857285],[0.005264362785965204,0.11458920687437057],[0.005615320056676865,0.12754316627979279],[0.0060883499681949615,0.14475927501916885],[0.00668345158919692,0.16622325778007507],[0.0073853665962815285,0.1921650469303131],[0.008178835734724998,0.22106808423995972],[0.009018082171678543,0.2515282481908798],[0.009918364696204662,0.283600389957428],[0.011017014272511005,0.31886284053325653],[0.013092241249978542,0.3753397464752197],[0.016754405573010445,0.4479012191295624],[0.02078278735280037,0.5074751973152161],[0.020927748642861843,0.5092062950134277],[0.021087968721985817,0.5114211738109589],[0.021225299686193466,0.5129342377185822],[0.021339742466807365,0.5145370364189148],[0.021515220403671265,0.5164268910884857],[0.021606775000691414,0.5178080201148987],[0.021713588386774063,0.5189371109008789],[0.021881436929106712,0.5206736028194427],[0.02203402854502201,0.5226752161979675],[0.02224002406001091,0.5244766771793365],[0.02238498441874981,0.5268311500549316],[0.022552834823727608,0.5284886360168457],[0.022705424576997757,0.5303801894187927],[0.022873273119330406,0.5319690108299255],[0.022995345294475555,0.5335407257080078],[0.023178454488515854,0.5354852080345154],[0.023361561819911003,0.5369954109191895],[0.0234988946467638,0.5389030575752258],[0.02363622561097145,0.5404595732688904],[0.0237735565751791,0.5421000719070435],[0.02395666390657425,0.5432946979999542],[0.024170290678739548,0.5456850826740265],[0.024315251037478447,0.5474127233028412],[0.024444952607154846,0.5488517880439758],[0.024582283571362495,0.5504879653453827],[0.024727245792746544,0.5518802106380463],[0.024872206151485443,0.5532122254371643],[0.024971390143036842,0.5542183518409729],[0.02517738565802574,0.5563498139381409],[0.02534523606300354,0.5576997995376587],[0.02554360218346119,0.5600431561470032],[0.025734340772032738,0.5618155598640442],[0.025925077497959137,0.5637146830558777],[0.026108186691999435,0.565285861492157],[0.026413366198539734,0.5682394504547119],[0.02672617696225643,0.5713584125041962],[0.02699320949614048,0.5736321806907654],[0.027328908443450928,0.5765826106071472],[0.027679866179823875,0.5791295766830444],[0.028030823916196823,0.5826875865459442],[0.02838941104710102,0.58555006980896],[0.02875562757253647,0.5890644490718842],[0.029205767437815666,0.5925487279891968],[0.029495690017938614,0.5950984358787537],[0.02984664775431156,0.597853273153305],[0.03015182726085186,0.6007567346096039],[0.030678262934088707,0.6045960783958435],[0.031128404662013054,0.6079083383083344],[0.03151750937104225,0.6111133694648743],[0.0319829098880291,0.6146441698074341],[0.032585641369223595,0.6189096570014954],[0.03308156132698059,0.6224732398986816],[0.03353169932961464,0.6257989406585693],[0.033997099846601486,0.628751665353775],[0.03453116491436958,0.6325443983078003],[0.03508812189102173,0.6363192796707153],[0.035889219492673874,0.6414023041725159],[0.03643854334950447,0.6447623372077942],[0.037247274070978165,0.6499588489532471],[0.03813229501247406,0.6547891497612],[0.038811322301626205,0.6593088507652283],[0.03952086716890335,0.6631858646869659],[0.040337223559617996,0.6676423251628876],[0.04110780358314514,0.671575665473938],[0.042084380984306335,0.6762939989566803],[0.043366141617298126,0.6832928657531738],[0.04438849538564682,0.6878525614738464],[0.045281147584319115,0.6923091113567352],[0.046753643080592155,0.699005663394928],[0.0479896254837513,0.704216718673706],[0.04918745718896389,0.7094857394695282],[0.05054550990462303,0.7150554060935974],[0.05213245004415512,0.7215446531772614],[0.05401693657040596,0.7282931208610535],[0.05532158352434635,0.733081728219986],[0.05693903937935829,0.7385870516300201],[0.05918974615633488,0.7456770837306976],[0.06074616685509682,0.7506455183029175],[0.06353093683719635,0.7590869665145874],[0.06620126590132713,0.7663694024085999],[0.06923018395900726,0.7741796970367432],[0.0722285807132721,0.7815521359443665],[0.07559319213032722,0.7891429960727692],[0.07923247292637825,0.7965290546417236],[0.08274967223405838,0.8036179840564728],[0.0875944122672081,0.812566488981247],[0.09257648512721062,0.821204423904419],[0.09842069447040558,0.8296499848365784],[0.10540932416915894,0.8390064239501953],[0.11334401369094849,0.8488179445266724],[0.12307164072990417,0.8592025339603424],[0.1362554356455803,0.871427059173584],[0.15413901209831238,0.88531693816185],[0.1755855605006218,0.8986321985721588],[0.2057679146528244,0.9135012626647949],[0.24842450767755508,0.9289411008358002],[0.32848095893859863,0.9485529363155365],[0.6001373529434204,0.979263424873352],[1,1]],[[0,0],[0.0024872205685824156,0.01628697570413351],[0.00254825665615499,0.018149955198168755],[0.002563515678048134,0.018907809630036354],[0.002594033721834421,0.019670451059937477],[0.002609292743727565,0.020511165261268616],[0.0026245517656207085,0.021054835990071297],[0.002639810787513852,0.021581724286079407],[0.0026550698094069958,0.022197093814611435],[0.0026703288313001394,0.022725185379385948],[0.002685587853193283,0.023309560492634773],[0.0027008468750864267,0.02392776682972908],[0.0027161058969795704,0.02455723099410534],[0.002731364918872714,0.02514740638434887],[0.0027466239407658577,0.02576451376080513],[0.0027618829626590014,0.026340864598751068],[0.002777141984552145,0.02693244442343712],[0.0027924010064452887,0.02754327841103077],[0.0028076600283384323,0.0281046275049448],[0.002822919050231576,0.028633885085582733],[0.0028381780721247196,0.02925090678036213],[0.0028534370940178633,0.029779501259326935],[0.002868696115911007,0.030337337404489517],[0.0028839551378041506,0.03088819980621338],[0.0028992141596972942,0.031465865671634674],[0.002914473181590438,0.03204318881034851],[0.0029297322034835815,0.03254906088113785],[0.002944991225376725,0.03312372788786888],[0.002960250247269869,0.033695586025714874],[0.0029755092691630125,0.034264735877513885],[0.002990768291056156,0.03482934460043907],[0.0030060273129493,0.035337090492248535],[0.0030212863348424435,0.03590552508831024],[0.003036545356735587,0.036414071917533875],[0.0030518043786287308,0.03696456924080849],[0.0030670634005218744,0.037544287741184235],[0.003082322422415018,0.03806682303547859],[0.0030975814443081617,0.03863423690199852],[0.0031128404662013054,0.03918692097067833],[0.003128099488094449,0.03971041738986969],[0.0031433585099875927,0.04027366638183594],[0.0031586175318807364,0.04080864042043686],[0.00317387655377388,0.041308578103780746],[0.0031891355756670237,0.04187314957380295],[0.0032043945975601673,0.04238913580775261],[0.003219653619453311,0.04296233877539635],[0.0032349126413464546,0.0435297004878521],[0.0032501716632395983,0.04404439777135849],[0.003265430685132742,0.04461486265063286],[0.0032806897070258856,0.045132916420698166],[0.0032959487289190292,0.045765385031700134],[0.003311207750812173,0.04634714871644974],[0.0033264667727053165,0.04691941291093826],[0.00334172579459846,0.047511544078588486],[0.003356984816491604,0.048086803406476974],[0.0033722438383847475,0.048666179180145264],[0.003387502860277891,0.04928964003920555],[0.003402761882171035,0.049881938844919205],[0.0034180209040641785,0.0504101999104023],[0.003433279925957322,0.05104168504476547],[0.0034485389478504658,0.05186722055077553],[0.0034943160135298967,0.053156815469264984],[0.0035400930792093277,0.05453469604253769],[0.003616388188675046,0.05664091184735298],[0.0036926832981407642,0.059121400117874146],[0.0037689784076064825,0.062030892819166183],[0.003875791560858488,0.06508110463619232],[0.004013122990727425,0.06943468004465103],[0.004165713209658861,0.07487867772579193],[0.004333562217652798,0.08124643936753273],[0.0045166704803705215,0.08796004951000214],[0.004730296786874533,0.09548747539520264],[0.004974441137164831,0.10467994958162308],[0.005264362785965204,0.11495743691921234],[0.005600061267614365,0.1268959864974022],[0.0060883499681949615,0.14462275803089142],[0.006698710843920708,0.16701743006706238],[0.00746166193857789,0.1956232562661171],[0.008331426419317722,0.2294660210609436],[0.009170671924948692,0.25993612408638],[0.010086213238537312,0.2928996980190277],[0.01120012253522873,0.32882679998874664],[0.013168536126613617,0.3779202997684479],[0.016540780663490295,0.4437362551689148],[0.020248722285032272,0.49676959216594696],[0.02035553567111492,0.49973422288894653],[0.02046234905719757,0.5007196068763733],[0.02061493881046772,0.5021961331367493],[0.02075226977467537,0.5021961331367493],[0.02085908316075802,0.5070708692073822],[0.020981155335903168,0.5079739987850189],[0.021149003878235817,0.5092485547065735],[0.021286334842443466,0.5107247531414032],[0.021446555852890015,0.5131061375141144],[0.021583886817097664,0.513453483581543],[0.021713588386774063,0.5162724554538727],[0.021850919350981712,0.5174099206924438],[0.02201876789331436,0.5187265276908875],[0.022148470394313335,0.5203648209571838],[0.02227817289531231,0.5236830413341522],[0.02246128022670746,0.5247068703174591],[0.022720683366060257,0.5271143913269043],[0.022842755541205406,0.530123770236969],[0.023018235340714455,0.5307375490665436],[0.023178454488515854,0.5329349339008331],[0.023331044241786003,0.5360198318958282],[0.023422598838806152,0.5360198318958282],[0.0235751885920763,0.5362760126590729],[0.02369726076722145,0.5384103059768677],[0.02391088753938675,0.5400838851928711],[0.0240482185035944,0.5424932241439819],[0.024185549467802048,0.5434424877166748],[0.024353399872779846,0.5454943180084229],[0.024490730836987495,0.5465380549430847],[0.024673838168382645,0.547978401184082],[0.024887464940547943,0.5516447424888611],[0.025070572271943092,0.5529333651065826],[0.02529182843863964,0.555942565202713],[0.02553597278892994,0.5566048622131348],[0.025764858350157738,0.5595908164978027],[0.026031890884041786,0.5628265142440796],[0.026367589831352234,0.5663167536258698],[0.026634622365236282,0.5688503980636597],[0.02693980373442173,0.5702885985374451],[0.027306020259857178,0.5748759806156158],[0.027664607390761375,0.5768629908561707],[0.027954528108239174,0.5792286396026611],[0.02833600342273712,0.5836398601531982],[0.02874799817800522,0.5873146653175354],[0.029091324657201767,0.5895479917526245],[0.029465170577168465,0.59382763504982],[0.02984664775431156,0.5958242416381836],[0.03015182726085186,0.5983777642250061],[0.030670633539557457,0.6030631065368652],[0.031235218048095703,0.6062743067741394],[0.0317235067486763,0.6112193465232849],[0.0321202427148819,0.6133860647678375],[0.032593272626399994,0.6168836951255798],[0.03306629881262779,0.6201407313346863],[0.03353932872414589,0.6230553984642029],[0.034264132380485535,0.6276596784591675],[0.03508049249649048,0.6335209012031555],[0.035553522408008575,0.6361592411994934],[0.03629358485341072,0.6414161324501038],[0.036987870931625366,0.6462172269821167],[0.03766689449548721,0.6498099565505981],[0.03825436905026436,0.6519148647785187],[0.039093613624572754,0.6586722731590271],[0.03990234062075615,0.6634447574615479],[0.04092469625174999,0.6684811115264893],[0.042069124057888985,0.6752421259880066],[0.04313725605607033,0.6788309812545776],[0.04393072426319122,0.6841847002506256],[0.04499122500419617,0.6872169971466064],[0.04621194675564766,0.6948262155056],[0.047898069024086,0.7011322975158691],[0.04890516400337219,0.7070285677909851],[0.05057602748274803,0.7123003900051117],[0.051728084683418274,0.7173745334148407],[0.05367361009120941,0.7260006368160248],[0.05520714074373245,0.7306593060493469],[0.05696192756295204,0.7367370128631592],[0.059647515416145325,0.7445862889289856],[0.06227969750761986,0.7537001669406891],[0.06461432576179504,0.760009378194809],[0.06739909946918488,0.7675766944885254],[0.07064927369356155,0.7751603126525879],[0.07322804629802704,0.7815313637256622],[0.07680628448724747,0.7899821996688843],[0.08065919205546379,0.7982136309146881],[0.08545052260160446,0.8061972856521606],[0.09037918597459793,0.8150983154773712],[0.095826655626297,0.8239147067070007],[0.10143435001373291,0.8316717743873596],[0.10993362590670586,0.843000739812851],[0.119562067091465,0.8538680076599121],[0.13165484368801117,0.8655529320240021],[0.1500801146030426,0.8806940317153931],[0.17006942629814148,0.8941399455070496],[0.1990310549736023,0.9090061783790588],[0.23722438514232635,0.9241947531700134],[0.3188677728176117,0.945740282535553],[0.5614252090454102,0.9753478765487671],[1,1]]]};
function SSTGHSCurveValue(x,nodes){x=SSTClamp(x,0,1);var lo=0,hi=nodes.length-1;while(hi-lo>1){var mid=(lo+hi)>>1;if(x<nodes[mid][0])hi=mid;else lo=mid;}var a=nodes[lo],b=nodes[hi],t=(x-a[0])/Math.max(1e-12,b[0]-a[0]);return a[1]+t*(b[1]-a[1]);}
function SSTGHSReferenceMatch(s,palette){if(palette!="Broadband RGB")return false;var channels=s.channels||[],ref=SST_GHS_REFERENCE.sourceStats;
 if(channels.length!=3&&(!s.channelStatistics||s.channelStatistics.length!=3))return false;
 var actual=[s.luminance];for(var c=0;c<3;c++)actual.push(channels.length?channels[c]:s.channelStatistics[c].statistics);
 var expected=[ref.luminance,ref.red,ref.green,ref.blue],keys=["median","p90","p99"];
 for(var i=0;i<4;i++)for(var j=0;j<keys.length;j++){var k=keys[j];if(Math.abs(Math.log((actual[i][k]+1e-9)/(expected[i][k]+1e-9)))>.30)return false;}return true;}
function SSTGHSReferenceEligible(source,palette){var shape=source.structure;return !!shape&&(shape.type=="galaxy"||shape.axisRatio>=1.8&&shape.extendedFraction>=.004)&&SSTGHSReferenceMatch(source,palette);}
function SSTGHSReferenceSamples(image,source){if(!SSTGHSReferenceEligible(source,"Broadband RGB"))return null;
 var result=[],points=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++)points.push({x:Math.min(image.width-1,Math.floor((x+.5)*image.width/24)),y:Math.min(image.height-1,Math.floor((y+.5)*image.height/16))});
 var core=source.corePoints||[];for(var i=0;i<core.length;i+=Math.max(1,Math.ceil(core.length/64)))points.push(core[i]);
 for(i=0;i<points.length;i++){var pt=points[i],rgb=[];for(var c=0;c<3;c++)rgb.push(SSTGHSCurveValue(image.sample(pt.x,pt.y,c),SST_GHS_REFERENCE.curves[c]));result.push({x:pt.x,y:pt.y,rgb:rgb});}return result;}
function SSTGHSReferenceQuality(image,source){var samples=SSTOptional(source,"ghsReferenceSamples",null);if(SSTOptional(source,"palette","Broadband RGB")!="Broadband RGB"||!samples)return null;
 var sum=0;for(var i=0;i<samples.length;i++)for(var c=0;c<3;c++){var d=image.sample(samples[i].x,samples[i].y,c)-samples[i].rgb[c];sum+=d*d;}
 var rmse=Math.sqrt(sum/Math.max(1,3*samples.length));return {profile:"M31 paired GHS reference",sampleCount:samples.length,rgbRMSE:rmse,scoreAdjustment:100-1000*rmse};}
function SSTPixel(values,p){
 var v=[],i;for(i=0;i<values.length;i++){if(!isFinite(values[i]))throw new Error("Nonfinite source sample encountered.");v.push(SSTClamp(values[i],0,1));}
 var pedestal=SSTOptional(p,"sourcePedestal",null),sourceGain=SSTOptional(p,"sourceGain",null);if(pedestal)for(i=0;i<v.length;i++)v[i]=SSTClamp(SSTNormalized(v[i],pedestal[i])*(sourceGain?sourceGain[i]:1),0,1);
 var learned=SSTOptional(p,"referenceCurve",null);if(learned){for(i=0;i<v.length;i++)v[i]=SSTGHSCurveValue(v[i],learned.curves[i]);return v;}
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
 if(SSTOptional(p,"shoGamutShoulder",false)){
  // Preserve RGB ratios while rolling projected peaks below the hard boundary.
  var projected=mx*z/y,mapped=projected>.90?.90+.095*(1-Math.exp(-(projected-.90)/.095)):projected;
  var gain=mapped/Math.max(mx,1e-12);for(i=0;i<v.length;i++)v[i]=SSTClamp(v[i]*gain,0,1);return v;
 }
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
// Optional final local contrast; absent in legacy recipes means no added pass.
function SSTFinalContrast(image,p,progress){
 var strength=SSTOptional(p,"autoHighContrast",0);
 if(strength===0)return image;
 if(typeof strength!="number"||!isFinite(strength)||strength<0||strength>1)throw new Error("Invalid Auto High Contrast strength");
 return SSTQuickFinish(image,{linear:false,contrast:strength},progress);
}
// Source-aware chroma restraint preserves stretched luminance and detail.
function SSTColorGuardPixel(v,linearY,guard){
 if(!guard||v.length!=3)return v;
 var t=SSTClamp((linearY-guard.low)/Math.max(1e-12,guard.high-guard.low),0,1);t=t*t*(3-2*t);
 var mix=guard.backgroundStrength*(1-t),lum=SSTY(v),redExcess=SSTClamp((v[0]-Math.max(v[1],v[2]))/Math.max(1e-12,v[0]),0,1);
 var peak=Math.max(v[0],v[1],v[2]),highlight=SSTClamp((peak-.55)/.35,0,1);highlight=highlight*highlight*(3-2*highlight);
 var red=guard.redStrength*highlight*SSTClamp((redExcess-.10)/.35,0,1)*t;
 // Bright magenta (both red and blue above green) can reveal core channel imbalance.
 // Use luminance rather than a spatial mask; preserve detail and leave red-only signal alone.
 var magentaExcess=SSTClamp((Math.min(v[0],v[2])-v[1])/Math.max(1e-12,peak),0,1);
 var brightCore=SSTSmooth((lum-.65)/.17),magenta=.95*brightCore*SSTSmooth((magentaExcess-.03)/.12)*t;
 mix=1-(1-mix)*(1-red)*(1-magenta);
 return [lum+(v[0]-lum)*(1-mix),lum+(v[1]-lum)*(1-mix),lum+(v[2]-lum)*(1-mix)];
}
function SSTApplyColorGuard(image,source,p,progress){
 var guard=SSTOptional(p,"broadbandColorGuard",null);if(!guard||image.numberOfChannels!=3)return image;
 for(var y=0;y<image.height;y++){for(var x=0;x<image.width;x++){
  var v=[image.sample(x,y,0),image.sample(x,y,1),image.sample(x,y,2)];
  var linearY=.2126*source.sample(x,y,0)+.7152*source.sample(x,y,1)+.0722*source.sample(x,y,2);
  v=SSTColorGuardPixel(v,linearY,guard);for(var c=0;c<3;c++)image.setSample(v[c],x,y,c);
 }if(progress&&y%32==0)progress((y+1)/image.height,"Restraining broadband background color and red highlights…");}
 return image;
}
// Spatial hybrid: one RGB blend weight from the coherent linear core.
function SSTGalaxyCoreMask(source,reference){
 var points=reference.corePoints||[],best=null,peak=0,W=Math.max(1,source.width-1),H=Math.max(1,source.height-1),bg=reference.luminance.p20;
 for(var i=0;i<points.length;i++){var pt=points[i],y=source.numberOfChannels==1?source.sample(pt.x,pt.y,0):.2126*source.sample(pt.x,pt.y,0)+.7152*source.sample(pt.x,pt.y,1)+.0722*source.sample(pt.x,pt.y,2);if(y>peak){peak=y;best=pt;}}
 if(!best||points.length<6)return null;
 var selected=[],sum=0,cx=0,cy=0;
 for(i=0;i<points.length;i++){var pt=points[i],x=pt.x/W,y=pt.y/H;if(Math.pow(x-best.x/W,2)+Math.pow(y-best.y/H,2)>.18*.18)continue;
  var l=source.numberOfChannels==1?source.sample(pt.x,pt.y,0):.2126*source.sample(pt.x,pt.y,0)+.7152*source.sample(pt.x,pt.y,1)+.0722*source.sample(pt.x,pt.y,2);
  var weight=Math.sqrt(Math.max(0,l-bg));selected.push({x:x,y:y,w:weight});sum+=weight;cx+=weight*x;cy+=weight*y;}
 if(selected.length<6||sum<=0)return null;cx/=sum;cy/=sum;var xx=0,xy=0,yy=0;
 for(i=0;i<selected.length;i++){var q=selected[i],dx=q.x-cx,dy=q.y-cy;xx+=q.w*dx*dx;xy+=q.w*dx*dy;yy+=q.w*dy*dy;}
 xx=xx/sum+.000225;yy=yy/sum+.000225;xy/=sum;
 return {cx:cx,cy:cy,xx:xx,xy:xy,yy:yy};
}
function SSTHybridWeight(x,y,h){
 var m=h.mask,dx=x-m.cx,dy=y-m.cy,det=m.xx*m.yy-m.xy*m.xy;
 var d=(m.yy*dx*dx-2*m.xy*dx*dy+m.xx*dy*dy)/Math.max(1e-12,det)/(h.radius*h.radius);
 var t=SSTClamp((9-d)/8,0,1);return t*t*(3-2*t);
}

function SSTHybridBlend(a,b,weight){var out=[];for(var c=0;c<a.length;c++)out.push(a[c]*(1-weight)+b[c]*weight);return out;}
// Blend complete output images, including each recipe's finishing passes.

// Full-resolution acceleration. Small previews keep the exact JS reference path.
var SST_NATIVE_DISABLED=false,SST_NATIVE_MIN_PIXELS=250000;
function SSTNativeAvailable(source){return !SST_NATIVE_DISABLED&&source.width*source.height>=SST_NATIVE_MIN_PIXELS&&typeof PixelMath!="undefined"&&typeof ImageWindow!="undefined";}
function SSTNativeNumber(x){if(!isFinite(x))throw new Error("Nonfinite native constant");return Number(x).toPrecision(17);}
function SSTNativeCurveExpression(nodes,x,lo,hi){lo=lo||0;if(hi===undefined)hi=nodes.length-1;
 if(hi-lo==1){var a=nodes[lo],b=nodes[hi],slope=(b[1]-a[1])/(b[0]-a[0]);return "("+SSTNativeNumber(a[1])+"+("+x+"-"+SSTNativeNumber(a[0])+")*"+SSTNativeNumber(slope)+")";}
 var mid=(lo+hi)>>1;return "iif("+x+"<"+SSTNativeNumber(nodes[mid][0])+","+SSTNativeCurveExpression(nodes,x,lo,mid)+","+SSTNativeCurveExpression(nodes,x,mid,hi)+")";}
function SSTNativeFinishCode(p,C){var code="",names=["npR","npG","npB"],gamma=p.finishGamma||1,e=SSTOptional(p,"endpoints",null);
 for(var c=0;c<C;c++){var n=names[c];if(gamma!=1)code+=n+"=iif("+n+"<=0,0,exp(ln(max(1e-30,"+n+"))*"+SSTNativeNumber(gamma)+"));";
  if(e)code+=n+"=min(1,max(0,("+n+"-"+SSTNativeNumber(e.black)+")/"+SSTNativeNumber(e.white-e.black)+"));";}
 if(p.highlightShoulder!==undefined){var k=SSTNativeNumber(p.highlightShoulder);code+="npP="+(C==1?"npR":"max(npR,max(npG,npB))")+";npA=iif(npP>"+k+",("+k+"+(0.98-"+k+")*(1-exp(-(npP-"+k+")/(0.98-"+k+"))))/max(1e-30,npP),1);";for(c=0;c<C;c++)code+=names[c]+"="+names[c]+"*npA;";}
 if(p.objectLift){var h=p.objectLift,b=SSTNativeNumber(h.background),m=SSTNativeNumber(h.midtone);code+="npP="+(C==1?"npR":"max(npR,max(npG,npB))")+";npT=(npP-"+b+")/(1-"+b+");npA=iif(npP>"+b+",("+b+"+(1-"+b+")*(1-"+m+")*npT/("+m+"+(1-2*"+m+")*npT))/max(1e-30,npP),1);";for(c=0;c<C;c++)code+=names[c]+"="+names[c]+"*npA;";}
 var steps=SSTOptional(p,"finishRefinements",[]);
 for(var i=0;i<steps.length;i++){var h=steps[i],peak=C==1?"npR":"max(npR,max(npG,npB))",w=h.mode==0?"(1-npP)*(1-npP)":h.mode==1?"4*npP*(1-npP)":h.mode==3?"npP*npP":"1";
  code+="npP="+peak+";npA=1+"+SSTNativeNumber(h.strength)+"*(1-npP)*("+w+");";
  for(c=0;c<C;c++)code+=names[c]+"=min(1,max(0,"+names[c]+"*npA));";
 }if(C==3&&SSTOptional(p,"shoRedLift",0)>0)code+="npY=0.2126*npR+0.7152*npG+0.0722*npB;npR=npR+"+SSTNativeNumber(p.shoRedLift)+"*npR*(1-npR)*4*npY*(1-npY);";return code;}
function SSTNativeApply(view,common,C){var p=SmartTools.configurePixelMath(new PixelMath,64);p.symbols="npR,npG,npB,npP,npA,npT,npY,npC,npD,npH,npM";p.useSingleExpression=C==1;
 p.expression=common+"npR";if(C==3){p.expression1=common+"npG";p.expression2=common+"npB";}
 var t=SmartTools.now();if(!p.executeOn(view,false))throw new Error("Native PixelMath failed");console.writeln("[SST native] PixelMath execution="+SmartTools.elapsed(t));}
function SSTNativeValidate(image,expected){var vt=SmartTools.now(),maxError=0,count=0;
 for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(image.width-1,Math.floor((x+.5)*image.width/24)),yy=Math.min(image.height-1,Math.floor((y+.5)*image.height/16)),v=expected(xx,yy);
  for(var c=0;c<image.numberOfChannels;c++){var actual=image.sample(xx,yy,c);if(!isFinite(actual))throw new Error("Nonfinite native output");maxError=Math.max(maxError,Math.abs(actual-v[c]));count++;}}
 if(maxError>2e-7)throw new Error("Native pixel validation mismatch: "+maxError);console.writeln("[SST native] JS reference probes="+count+"; max error="+maxError+"; validation="+SmartTools.elapsed(vt));}
function SSTNativeReference(source,p,progress){if(!p.referenceCurve||p.quick||p.objectLift||p.highlightShoulder||p.shoRedLift)return null;
 var pool={},out=null,t=SmartTools.now();try{
  if(progress)progress(.02,"Copying source for native GHS curve…");var w=SmartTools.acquireWindow(pool,"GHSNative",source.width,source.height,3,64,true);
  SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(source);}finally{w.mainView.endProcess();}
  console.writeln("[SST native] GHS source copy="+SmartTools.elapsed(t));var names=["npR","npG","npB"],code="";
  for(var c=0;c<3;c++)code+=names[c]+"="+SSTNativeCurveExpression(p.referenceCurve.curves[c],"min(1,max(0,$T["+c+"]))")+";";
  code+=SSTNativeFinishCode(p,3);if(progress)progress(.15,"Applying native GHS curve and saved finishing…");SSTNativeApply(w.mainView,code,3);
  SSTNativeValidate(w.mainView.image,function(x,y){var v=[];for(var c=0;c<3;c++)v.push(source.sample(x,y,c));return SSTFinishedValues(SSTPixel(v,p),p);});
  if(progress)progress(.75,"Applying saved contrast and color restraint…");out=new Image(w.mainView.image);var enhanced=SSTFinalContrast(out,p);if(enhanced!==out){out.free();out=enhanced;}SSTApplyColorGuard(out,source,p);
  console.writeln("[SST native] GHS total="+SmartTools.elapsed(t));if(progress)progress(1,"Native GHS stretch complete");var result=out;out=null;return result;
 }finally{if(out)out.free();SmartTools.closeWindowPool(pool);}}
function SSTNativeBlend(source,p,progress){var pool={},out=null,temp=null,blend=p.recipeBlend,weights=SSTOptional(blend,"weights",[1-blend.amount,blend.amount]),samples=[],W=source.width,H=source.height,C=source.numberOfChannels;
 try{var target=null;
  for(var i=0;i<blend.recipes.length;i++){
   temp=SSTProcess(source,blend.recipes[i],function(f,stage){if(progress)progress(.8*(i+f)/blend.recipes.length,"Blend source "+(i+1)+": "+stage);});
   var probes=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++){var v=[];for(var c=0;c<C;c++)v.push(temp.sample(Math.min(W-1,Math.floor((x+.5)*W/24)),Math.min(H-1,Math.floor((y+.5)*H/16)),c));probes.push(v);}samples.push(probes);
   var w=SmartTools.acquireWindow(pool,i==0?"BlendTarget":"BlendInput",W,H,C,64,C==3);SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(temp);}finally{w.mainView.endProcess();}temp.free();temp=null;
   var pm=SmartTools.configurePixelMath(new PixelMath,64);pm.useSingleExpression=true;
   if(i==0){target=w;pm.expression="$T*"+SSTNativeNumber(weights[i]);}else pm.expression="$T+"+w.mainView.id+"*"+SSTNativeNumber(weights[i]);
   if(!pm.executeOn(target.mainView,false))throw new Error("Native image blend failed");
  }
  if(progress)progress(.85,"Applying native blend refinements…");var names=["npR","npG","npB"],code="";for(var c=0;c<C;c++)code+=names[c]+"=$T"+(C==1?"":"["+c+"]")+";";
  // Blend wrappers only apply finishRefinements, matching the JS blend path.
  code+=SSTNativeFinishCode({finishRefinements:SSTOptional(p,"finishRefinements",[])},C);SSTNativeApply(target.mainView,code,C);
  var probeIndex=0;SSTNativeValidate(target.mainView.image,function(){var v=[];for(var c=0;c<C;c++){var sum=0;for(var i=0;i<samples.length;i++)sum+=weights[i]*samples[i][probeIndex][c];v.push(sum);}probeIndex++;return SSTRefineFinished(v,p);});
  out=new Image(target.mainView.image);if(progress)progress(1,"Native image blend complete");var result=out;out=null;return result;
 }finally{if(out)out.free();if(temp)temp.free();SmartTools.closeWindowPool(pool);}}

// Compute shared RGB decisions once in a monochrome image, then use a short RGB/K pass.
function SSTNativeSingle(view,expression,symbols){var pm=SmartTools.configurePixelMath(new PixelMath,64);pm.useSingleExpression=true;pm.expression=expression;pm.symbols=symbols||"";
 var t=SmartTools.now();if(!pm.executeOn(view,false))throw new Error("Native shared RGB pass failed");console.writeln("[SST native shared] RGB/K apply="+SmartTools.elapsed(t));}
function SSTNativeScalarMap(view,pool,key,code,result){var allocation=SmartTools.now(),w=SmartTools.acquireWindow(pool,"SharedRGBGain",view.image.width,view.image.height,1,32,false),pm=SmartTools.configurePixelMath(new PixelMath,64);
 pm.useSingleExpression=true;pm.symbols="npR,npG,npB,npP,npA,npT,npY,npC,npD,npH,npM,npX,npI,npJ,npF,npV";pm.expression=code+result;pm.truncate=false;
 console.writeln("[SST native timing] "+key+" buffer/setup="+SmartTools.elapsed(allocation)+" | pixels="+(view.image.width*view.image.height)+" | map bits=32 | working bits=64 | map MiB="+(view.image.width*view.image.height*4/1048576).toFixed(2));var t=SmartTools.now();if(!pm.executeOn(w.mainView,false))throw new Error("Native scalar map failed");console.writeln("[SST native shared] "+key+" mono calculation="+SmartTools.elapsed(t));return w;}
function SSTNativeRefinementGainCode(steps,id){
 // For peak in [0,1], modes 0..3 and |strength|<=.75 each step stays in [0,1].
 // Accumulate the same sequential gains; preserve the original tiny-peak identity rule.
 var code="npM=max("+id+"[0],max("+id+"[1],"+id+"[2]));npP=npM;npA=1;";
 for(var i=0;i<steps.length;i++){var h=steps[i];if(h.mode%1||h.mode<0||h.mode>3||!isFinite(h.strength)||Math.abs(h.strength)>.75)return null;if(h.strength===0)continue;
  var w=h.mode==0?"npT*npT":h.mode==1?"4*npP*npT":h.mode==3?"npP*npP":"1";
  code+="npT=1-npP;npH=1+"+SSTNativeNumber(h.strength)+"*npT*("+w+");npA=npA*npH;npP=npP*npH;";
 }return code;
}
function SSTNativeFinishFast(view,p,C,pool){
 // SHO's channel-specific finishing remains on the validated general path.
 if(C!=3||SSTOptional(p,"shoRedLift",0)>0){SSTNativeApply(view,SSTNativeInputCode(C)+SSTNativeFinishCode(p,C),C);return;}
 var n=SSTNativeNumber,gamma=p.finishGamma||1,e=SSTOptional(p,"endpoints",null),expr="$T";
 if(gamma!=1)expr="iif($T<=0,0,exp(ln(max(1e-30,$T))*"+n(gamma)+"))";
 if(e&&(e.black!==0||e.white!==1))expr="min(1,max(0,("+expr+"-"+n(e.black)+")/"+n(e.white-e.black)+"))";
 if(expr!="$T")SSTNativeSingle(view,expr);
 var steps=SSTOptional(p,"finishRefinements",[]);if(!steps.length&&p.highlightShoulder===undefined&&!p.objectLift)return;
 var linked={finishRefinements:steps};if(p.highlightShoulder!==undefined)linked.highlightShoulder=p.highlightShoulder;if(p.objectLift)linked.objectLift=p.objectLift;
 var id=view.id,code="npM=max("+id+"[0],max("+id+"[1],"+id+"[2]));npR=npM;"+SSTNativeFinishCode(linked,1);
 var result="iif(npM<=1e-30,1,npR/max(1e-30,npM))",fast=p.highlightShoulder===undefined&&!p.objectLift?SSTNativeRefinementGainCode(steps,id):null;
 if(fast!==null){code=fast;result="iif(npM<=1e-30,1,npA)";console.writeln("[SST finishing] Bounded sequential gain path | refinements="+steps.length);}else console.writeln("[SST finishing] General linked gain path");
 var map=SSTNativeScalarMap(view,pool,"FinishGain",code,result);SSTNativeSingle(view,"$T*"+map.mainView.id);
}

function SSTNativeInputCode(C){return "npR=$T"+(C==1?"":"[0]")+";"+(C==3?"npG=$T[1];npB=$T[2];":"");}
function SSTNativeContrast(view,strength,pool,progress){if(!strength)return;var before=null,map=null,W=view.image.width,H=view.image.height,C=view.image.numberOfChannels,t=SmartTools.now();
 try{if(progress)progress("Building reduced Auto High Contrast map…");var ct=SmartTools.now();map=SSTContrastMap(view.image);console.writeln("[SST native timing] Contrast reduced map="+SmartTools.elapsed(ct)+" | map="+map.width+"x"+map.height);var probes=[];
  for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(W-1,Math.floor((x+.5)*W/24)),yy=Math.min(H-1,Math.floor((y+.5)*H/16)),v=[];for(var c=0;c<C;c++)v.push(view.image.sample(xx,yy,c));var peak=Math.max.apply(null,v),gain=peak>=.85?1:Math.min(Math.max(0,1+strength*(SSTMapGain(map,xx,yy,W,H)-1)),1/Math.max(1e-8,peak));probes.push(v.map(function(z){return z*gain;}));}
  var mw=SmartTools.acquireWindow(pool,"STFGain",map.width,map.height,1,64,false);SmartTools.beginPrivateProcess(mw.mainView);try{mw.mainView.image.assign(map);}finally{mw.mainView.endProcess();}
  var n=SSTNativeNumber,id=mw.mainView.id;
  var code="npX=min("+(map.width-1)+",max(0,(x()+0.5)*"+n(map.width/W)+"-0.5));npY=min("+(map.height-1)+",max(0,(y()+0.5)*"+n(map.height/H)+"-0.5));npI=floor(npX);npJ=floor(npY);npF=npX-npI;npV=npY-npJ;";
  code+="npM=(1-npV)*((1-npF)*pixel("+id+",npI,npJ)+npF*pixel("+id+",min(npI+1,"+(map.width-1)+"),npJ))+npV*((1-npF)*pixel("+id+",npI,min(npJ+1,"+(map.height-1)+"))+npF*pixel("+id+",min(npI+1,"+(map.width-1)+"),min(npJ+1,"+(map.height-1)+")));";
  code+="npP="+(C==1?"$T":"max($T[0],max($T[1],$T[2]))")+";$T*iif(npP>=0.85,1,min(max(0,1+"+n(strength)+"*(npM-1)),1/max(1e-8,npP)))";
  // RGB/K expressions evaluate per channel; compute interpolation only once in mono.
  var split=code.indexOf(";$T*iif");if(split<0)throw new Error("Missing contrast gain boundary");
  var shared=code.slice(0,split+1).replace(/\$T/g,view.id),gainExpr=code.slice(split+4);
  var gain=SSTNativeScalarMap(view,pool,"ContrastGain",shared,gainExpr);
  if(progress)progress("Applying native Auto High Contrast…");SSTNativeSingle(view,"$T*"+gain.mainView.id);var index=0;SSTNativeValidate(view.image,function(){return probes[index++];});console.writeln("[SST native STF] Contrast map + native apply="+SmartTools.elapsed(t));
 }finally{if(map)map.free();}}
function SSTNativeColorGuard(view,source,p,pool){var g=SSTOptional(p,"broadbandColorGuard",null);if(!g||source.numberOfChannels!=3)return;
 var W=source.width,H=source.height,expected=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(W-1,Math.floor((x+.5)*W/24)),yy=Math.min(H-1,Math.floor((y+.5)*H/16)),v=[],raw=[];for(var c=0;c<3;c++){v.push(view.image.sample(xx,yy,c));raw.push(source.sample(xx,yy,c));}expected.push(SSTColorGuardPixel(v,SSTY(raw),g));}
 var rawTime=SmartTools.now(),raw=SmartTools.acquireWindow(pool,"STFOriginal",W,H,3,64,true);SmartTools.beginPrivateProcess(raw.mainView);try{raw.mainView.image.assign(source);}finally{raw.mainView.endProcess();}
 console.writeln("[SST native timing] Color source buffer/copy="+SmartTools.elapsed(rawTime));var id=raw.mainView.id,n=SSTNativeNumber,code=SSTNativeInputCode(3);
 code+="npT=min(1,max(0,((0.2126*"+id+"[0]+0.7152*"+id+"[1]+0.0722*"+id+"[2])-"+n(g.low)+")/"+n(g.high-g.low)+"));npT=npT*npT*(3-2*npT);npY=0.2126*npR+0.7152*npG+0.0722*npB;npP=max(npR,max(npG,npB));";
 code+="npC="+n(g.backgroundStrength)+"*(1-npT);npD=(npR-max(npG,npB))/max(1e-12,npR);npH=min(1,max(0,(npP-0.55)/0.35));npH=npH*npH*(3-2*npH);npD="+n(g.redStrength)+"*npH*min(1,max(0,(npD-0.10)/0.35))*npT;";
 code+="npM=(min(npR,npB)-npG)/max(1e-12,npP);npH=min(1,max(0,(npY-0.65)/0.17));npH=npH*npH*(3-2*npH);npM=min(1,max(0,(npM-0.03)/0.12));npM=0.95*npH*npM*npM*(3-2*npM)*npT;npA=(1-npC)*(1-npD)*(1-npM);npR=npY+(npR-npY)*npA;npG=npY+(npG-npY)*npA;npB=npY+(npB-npY)*npA;";
 var cut=code.indexOf("npR=npY+");if(cut<0)throw new Error("Missing native color-gain boundary");
 var gainCode=code.slice(0,cut).replace(/\$T/g,view.id),mask=SSTNativeScalarMap(view,pool,"ColorGain",gainCode,"npA");
 var finalCode="npY=0.2126*$T[0]+0.7152*$T[1]+0.0722*$T[2];npY+($T-npY)*"+mask.mainView.id;
 SSTNativeSingle(view,finalCode,"npY");
 var index=0;SSTNativeValidate(view.image,function(){return expected[index++];});}
// Sequential final processing retained after the combined experiment showed no gain.
function SSTNativeFinalPasses(view,source,p,pool){SSTNativeContrast(view,SSTOptional(p,"autoHighContrast",0),pool);if(!p.quick)SSTNativeColorGuard(view,source,p,pool);}
function SSTNativeSTF(source,p,progress){if(typeof HistogramTransformation=="undefined"||p.family>=3||p.referenceCurve||p.hdr||p.selectiveMidtone!==undefined||p.hdrShape!==undefined)return null;
 var pool={},out=null,C=source.numberOfChannels,t=SmartTools.now();if(C!=1&&C!=3)return null;
 function report(f,s){if(progress)progress(f,s);}
 try{report(.02,"Copying source for native Image Analysis STF recipe…");var w=SmartTools.acquireWindow(pool,"STFRecipe",source.width,source.height,C,64,C==3);SmartTools.beginPrivateProcess(w.mainView);try{w.mainView.image.assign(source);}finally{w.mainView.endProcess();}
  console.writeln("[SST native STF] Source copy="+SmartTools.elapsed(t));var h=new HistogramTransformation,rows=[[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1],[0,.5,1,0,1]];
  for(var c=0;c<C;c++)rows[C==1?3:c]=[p.black[c],p.shape[c],1,0,1];h.H=rows;report(.10,"Applying native Image Analysis channel curves…");var st=SmartTools.now();if(!h.executeOn(w.mainView,false))throw new Error("Native recipe HistogramTransformation failed");console.writeln("[SST native STF] Channel transform="+SmartTools.elapsed(st));
  SSTNativeValidate(w.mainView.image,function(x,y){var v=[];for(var c=0;c<C;c++)v.push(source.sample(x,y,c));return SSTPixel(v,p);});
  if(p.quick){if(p.linear){report(.25,"Measuring native recipe linked endpoints…");var lo=Infinity,hi=-Infinity;for(c=0;c<C;c++){w.mainView.image.selectedChannel=c;lo=Math.min(lo,w.mainView.image.minimum());hi=Math.max(hi,w.mainView.image.maximum());}w.mainView.image.resetSelections();
    if(hi-lo>1e-12){var pm=SmartTools.configurePixelMath(new PixelMath,64);pm.useSingleExpression=true;pm.expression="($T-"+SSTNativeNumber(lo)+")/"+SSTNativeNumber(hi-lo);if(!pm.executeOn(w.mainView,false))throw new Error("Native recipe linked endpoints failed");}}
   report(.40,"Applying native recipe contrast…");SSTNativeContrast(w.mainView,p.contrast,pool,function(s){report(.45,s);});
  }
  report(.60,"Applying native saved finishing adjustments…");var probes=[];for(var y=0;y<16;y++)for(var x=0;x<24;x++){var xx=Math.min(source.width-1,Math.floor((x+.5)*source.width/24)),yy=Math.min(source.height-1,Math.floor((y+.5)*source.height/16)),v=[];for(c=0;c<C;c++)v.push(w.mainView.image.sample(xx,yy,c));probes.push(SSTFinishedValues(v,p));}
  SSTNativeFinishFast(w.mainView,p,C,pool);var index=0;SSTNativeValidate(w.mainView.image,function(){return probes[index++];});
  report(.80,"Applying native final contrast and color protection…");SSTNativeFinalPasses(w.mainView,source,p,pool);
  var exportTime=SmartTools.now();out=new Image(w.mainView.image);console.writeln("[SST native timing] Recipe output copy="+SmartTools.elapsed(exportTime));console.writeln("[SST native STF] Recipe "+p.id+" total="+SmartTools.elapsed(t));report(1,"Native Image Analysis STF recipe complete");var result=out;out=null;return result;
 }finally{if(out)out.free();SmartTools.closeWindowPool(pool);}}

function SSTProcessRecipeBlend(source,p,progress){
 var blend=p.recipeBlend,weights=SSTOptional(blend,"weights",[1-blend.amount,blend.amount]),out=null,temp=null;
 try{for(var i=0;i<blend.recipes.length;i++){
   temp=SSTProcess(source,blend.recipes[i],function(f,stage){if(progress)progress(.8*(i+f)/blend.recipes.length,"Blend source "+(i+1)+": "+stage);});
   if(!out){out=temp;temp=null;for(var y=0;y<out.height;y++)for(var x=0;x<out.width;x++)for(var c=0;c<out.numberOfChannels;c++)out.setSample(out.sample(x,y,c)*weights[i],x,y,c);}
   else{for(var y=0;y<out.height;y++)for(var x=0;x<out.width;x++)for(var c=0;c<out.numberOfChannels;c++)out.setSample(out.sample(x,y,c)+temp.sample(x,y,c)*weights[i],x,y,c);temp.free();temp=null;}
  }
  for(var y=0;y<out.height;y++){for(var x=0;x<out.width;x++){var v=[];for(var c=0;c<out.numberOfChannels;c++)v.push(out.sample(x,y,c));v=SSTRefineFinished(v,p);for(c=0;c<v.length;c++)out.setSample(v[c],x,y,c);}
   if(progress&&y%32==0)progress(.8+.2*(y+1)/out.height,"Finishing finalist blend…");}
  var result=out;out=null;if(progress)progress(1,"Blend complete");return result;
 }finally{if(out)out.free();if(temp)temp.free();}
}
function SSTProcess(source,p,progress){
 if(SSTNativeAvailable(source))try{var nativeResult=p.recipeBlend?SSTNativeBlend(source,p,progress):SSTNativeReference(source,p,progress);if(!nativeResult)nativeResult=SSTNativeSTF(source,p,progress);if(nativeResult)return nativeResult;}
 catch(nativeError){console.warningln("[SST native] Rejected; exact JavaScript fallback: "+nativeError);if(progress)progress(0,"Native processing rejected; using exact JavaScript…");}
 if(SSTOptional(p,"recipeBlend",null))return SSTProcessRecipeBlend(source,p,progress);
 function report(f,stage){if(progress)progress(f,stage);}
 report(0,"Preparing full-resolution buffer…");
 var out=new Image(source);out.resetSelections();var C=source.numberOfChannels,hybrid=null /* disabled, including saved spatialHybrid recipes */,coreRecipe=null;
 try{for(var y=0;y<source.height;y++){for(var x=0;x<source.width;x++){var v=[];for(var c=0;c<C;c++)v.push(source.sample(x,y,c));var raw=v;v=SSTPixel(raw,p);if(!p.quick)v=SSTFinishedValues(v,p);
  /* Spatial core blending temporarily disabled.
  if(hybrid){var weight=SSTHybridWeight(x/Math.max(1,source.width-1),y/Math.max(1,source.height-1),hybrid);
   if(weight>0){var protectedValues=SSTFinishedValues(SSTPixel(raw,coreRecipe),coreRecipe);v=SSTHybridBlend(v,protectedValues,weight);}}
  */
  for(c=0;c<C;c++)out.setSample(v[c],x,y,c);}
  if(y%32==0)report(.70*(y+1)/source.height,"Stretching full-resolution pixels…");
 }if(!p.quick){var enhanced=SSTFinalContrast(out,p,function(f,stage){report(.70+(SSTOptional(p,"broadbandColorGuard",null)?.25:.30)*f,stage);});if(enhanced!==out){out.free();out=enhanced;}SSTApplyColorGuard(out,source,p,function(f,stage){report(.95+.05*f,stage);});report(1,"Stretch complete");return out;}report(.70,"Finishing stretch…");
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

 var enhanced=SSTFinalContrast(out,p,function(f,stage){report(.995+.005*f,stage);});if(enhanced!==out){out.free();out=enhanced;}
 report(1,"Stretch complete");return out;}catch(e){out.free();throw e;}
}
function SSTStellarRecipe(image,reference,v,group){
 var points=reference.structure.stellarPoints,peaks=[],C=image.numberOfChannels;
 for(var i=0;i<points.length;i++){var peak=0;for(var c=0;c<C;c++)peak=Math.max(peak,image.sample(points[i].x,points[i].y,c));peaks.push(peak);}
 peaks.sort(function(a,b){return a-b;});var bg=Math.max(0,reference.luminance.p20),anchor=Math.max(bg+1e-8,SSTPercentile(peaks,.5));
 return {version:2,coreContrast:0,saturation:0,background:bg,backgroundOutput:.001,
  knee:Math.min(.95,anchor),kneeOutput:.38+.035*v+.012*(group-4),ceiling:.92+.02*(group%3),lowShape:1+(group%3),highShape:Math.max(1,Math.min(1e12,(1-anchor)/Math.max(1e-8,anchor-bg)))};
}
var SST_M31_BLEND_REFERENCE={"stats":{"luminance":{"median":0.0026972964400891215,"sigma":6.212313622798327e-05,"min":0.0022021467147395014,"max":0.8018466792702674,"p90":0.005065306940721347,"p99":0.020417812772262855,"count":58200},"channels":[{"median":0.0027268388075754046,"sigma":6.640866149682551e-05,"min":0.0021760771051049232,"max":0.8674163818359375,"p90":0.005043172603473066,"p99":0.02087306844070567,"count":58200},{"median":0.0026912669418379664,"sigma":6.176420054398478e-05,"min":0.002207228448241949,"max":0.7704654932022095,"p90":0.005074908351525663,"p99":0.020439465586096058,"count":58200},{"median":0.0027022045105695724,"sigma":0.00012786527877906337,"min":0.0020692585967481136,"max":0.9196265339851379,"p90":0.005080703319981693,"p99":0.019771249815821693,"count":58200}]},"palette":"Broadband RGB","recipes":[{"id":"f4v1","family":4,"variant":1,"target":0.24942420922572076,"black":[0],"shape":[498.0383101643631],"method":"asinh","second":0,"baseline":false,"scenario":"Galaxy central shoulder lift","finishGamma":0.7577290330856016,"luminanceGamut":true,"finishRefinements":[{"mode":3,"strength":0.12}],"broadbandColorGuard":{"version":1,"low":0.0027594195763171047,"high":0.003007912121229038,"backgroundStrength":0.75,"redStrength":0.25},"autoHighContrast":0.5,"endpoints":{"version":1,"black":0.21206421333423514,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"},"duplicateUnresolved":false},{"id":"f7v4","family":7,"variant":4,"target":0.24942420922572076,"black":[0],"shape":[0.010702581654169818],"method":"mtf","second":0.2727272727272727,"baseline":false,"scenario":"Galaxy central shoulder lift","finishGamma":1.1533484606855668,"luminanceGamut":true,"finishRefinements":[{"mode":3,"strength":0.12}],"broadbandColorGuard":{"version":1,"low":0.0027594195763171047,"high":0.003007912121229038,"backgroundStrength":0.75,"redStrength":0.25},"autoHighContrast":0.5,"endpoints":{"version":1,"black":0.22019985089183414,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"},"duplicateUnresolved":false}]};
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
 var hybridMask=null; // Spatial hybrid temporarily disabled; skip mask calculation.
 // var hybridMask=source&&hdrEligible&&hdrSource.structure.type=="galaxy"?SSTGalaxyCoreMask(source,hdrSource):null;
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
  // Reserve existing HDR slots for brighter reference-like choices, without adding rounds.
  // Galaxy recipes never enter this source-specific branch.
  if(p.hdr&&group>=6&&hdrSource.structure.type=="extended"&&palette=="Broadband RGB"&&stats.channels.length==3&&
     assessment.eligible&&assessment.tailToMedian>=50&&assessment.coreToNebula>=12&&assessment.coreFraction>=.004&&assessment.coreFraction<=.025&&
     Math.abs(Math.log(assessment.tailToMedian/337.70))/Math.log(8)+Math.abs(Math.log(assessment.coreToNebula/34.25))/Math.log(4)<=1.5){
   p.hdr.kneeOutput=[.62,.72,.82][v%3];p.hdr.ceiling=[.96,.97,.98][group-6];
   p.hdr.saturation=[.15,.25,.35][group-6];p.scenario="M42 reference: bright core with visible outer nebulosity";
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
  if(palette=="SHO"){
   SSTCalibrateSHO(p,stats);
   if(p.family==2&&!p.quick){for(var sc=0;sc<stats.channels.length;sc++){var st=stats.channels[sc],b=SSTBlack(st,5.5);p.black[sc]=b;p.shape[sc]=SSTMidtone(Math.max(1e-12,SSTNormalized(st.median,b)),SST_TARGET_MEDIANS[p.variant]);}p.scenario="SHO conservative channel backgrounds";}
  }
  if(source&&!p.quick)p.pendingPreparation=true;
  if(!p.quick&&palette=="Broadband RGB"&&stats.channels.length==3&&(!preferenceModel||!preferenceModel.examples.length)){
   var med=stats.luminance.median,sigma=Math.max(1e-12,stats.luminance.sigma);
   p.broadbandColorGuard={version:1,low:med+sigma,high:med+5*sigma,backgroundStrength:.75,redStrength:.25};
  }
  /* Spatial hybrid temporarily disabled: reported donut artifacts in galaxy dust lanes.
  if(hybridMask&&!p.quick&&v%3==2){
   delete p.hdr;delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;
   p.spatialHybrid={version:1,mask:SSTCopy(hybridMask),radius:[1,1.3,1.6][group%3],core:SSTHDRRecipe(hdrSource,0,group)};
   p.spatialHybrid.core.saturation=0;p.scenario="Spatial hybrid: conventional disk, protected core";
  }
  */
  if(!p.quick)p.autoHighContrast=[0,.5,1][v%3];
  if(group==1&&v==8&&source&&hdrSource.structure.type=="galaxy"&&!p.quick&&palette==SST_M31_BLEND_REFERENCE.palette&&stats.channels.length==3){
   var reference=SST_M31_BLEND_REFERENCE.stats,aLum=stats.luminance,bLum=reference.luminance;
   var distance=SSTDistance(aLum,bLum)+.5*Math.abs(Math.log((aLum.p99+1e-8)/(aLum.median+1e-8))-Math.log((bLum.p99+1e-8)/(bLum.median+1e-8)));
   if(distance<.35){p.recipeBlend={version:1,amount:.5,recipes:SSTCopy(SST_M31_BLEND_REFERENCE.recipes)};
    delete p.pendingPreparation;delete p.finishRefinements;delete p.spatialHybrid;delete p.hdr;delete p.endpoints;delete p.objectLift;delete p.objectTarget;
    p.scenario="50/50 blend of completed asinh and two-stage MTF results";}
  }
  if(source&&SSTGHSReferenceEligible(hdrSource,palette)&&SSTGHSReferenceMatch(stats,palette)&&group<3&&v==8){
   p={id:p.id,family:3,variant:v,target:.25,black:[0],shape:[.5],method:"mtf",second:0,baseline:false,quick:false,finishGamma:[1,.94,1.06][group],autoHighContrast:0,
    referenceCurve:{version:1,name:SST_GHS_REFERENCE.name,curves:SSTCopy(SST_GHS_REFERENCE.curves)},scenario:"Paired GHS reference"+(group?" — gentle brightness variation":" — measured match")};
  }
  if(palette=="SHO"&&SSTOptional(p,"sourceGain",null))p.autoHighContrast=Math.min(.25,SSTOptional(p,"autoHighContrast",0));
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
// SHO linked curves must stretch emission above each channel's pedestal.
// Stretching the common raw offset compresses structure and hides color differences.
function SSTCalibrateSHO(p,stats){
 if(p.quick||p.family<3||p.hdr||p.referenceCurve||p.recipeBlend||stats.channels.length!=3)return;
 var corrected=SSTCopy(stats),pedestal=[],gains=[],lum=[],spreads=stats.channels.map(function(ch){return Math.max(1e-12,ch.sigma);}).sort(function(a,b){return a-b;}),common=spreads[1];
 for(var c=0;c<3;c++){var raw=stats.channels[c],b=SSTBlack(raw,2.8),gain=SSTClamp(common/Math.max(1e-12,raw.sigma),.05,20);pedestal.push(b);gains.push(gain);
  var ch=corrected.channels[c];for(var k in ch)if(["median","min","max","p90","p99"].indexOf(k)>=0)ch[k]=SSTClamp(SSTNormalized(raw[k],b)*gain,0,1);ch.sigma=gain*raw.sigma/Math.max(1e-12,1-b);lum.push(ch.median);}
 corrected.luminance.median=SSTY(lum);
 var solved=SSTBuildRecipe(p.family,p.variant,corrected);p.sourcePedestal=pedestal;p.sourceGain=gains;p.black=solved.black;p.shape=solved.shape;p.method=solved.method;p.second=solved.second;
 delete p.selectiveMidtone;delete p.selectiveKnee;delete p.selectiveCeiling;delete p.objectTarget;delete p.objectLift;delete p.endpoints;
 p.finishGamma=SSTClamp(Math.log(SSTClamp(p.target,.12,.36))/Math.log(SST_TARGET_MEDIANS[p.variant]),.65,1.5);
 p.shoGamutShoulder=true;p.autoHighContrast=Math.min(.25,SSTOptional(p,"autoHighContrast",0));
 p.scenario="SHO channel-balanced signal with soft highlights";
}
function SSTSHOBlendPreference(session){
 if(SSTOptional(session,"palette","Broadband RGB")!="SHO")return null;
 var model=SSTOptional(session,"preferenceModel",null),best=null;if(!model)return null;
 for(var i=0;i<model.examples.length;i++){var e=model.examples[i];if(e.weight>=.5&&SSTOptional(e.recipe,"recipeBlend",null)&&(!best||e.weight>best.weight))best=e;}return best;
}
function SSTPrepareGrid(session,source,progress){
 var grid=SSTGrid(session),pending=false;
 for(var i=0;i<grid.length;i++)if(SSTOptional(grid[i],"pendingPreparation",false))pending=true;
 if(!pending)return;
 var samples=SSTEndpointSamples(source),probes=SSTPreviewSamples(source),reference=SSTQualitySource(source),accepted=[],C=source.numberOfChannels;
 var shoAnchor=null;if(SSTOptional(session,"palette","Broadband RGB")=="SHO"&&session.stage=="round")for(var ai=0;ai<grid.length;ai++)if(grid[ai].family==0&&!grid[ai].quick){shoAnchor=SSTCopy(grid[ai]);if(shoAnchor.pendingPreparation){SSTFitEndpoints(shoAnchor,samples,C);delete shoAnchor.pendingPreparation;}break;}
 for(i=0;i<grid.length;i++){var p=grid[i];if(progress)progress(i,grid.length);
  if(SSTOptional(p,"recipeBlend",null)){p.duplicateUnresolved=false;continue;}
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
   if(shoAnchor&&p.family==7&&p.shoGamutShoulder){
    var linked=SSTCopy(p);p.recipeBlend={version:1,amount:.5,weights:[.5,.5],recipes:[SSTCopy(shoAnchor),linked]};
    p.scenario="SHO halfway: channel curves + soft linked stretch";
    var learned=SSTSHOBlendPreference(session);
    delete p.finishRefinements;delete p.spatialHybrid;delete p.hdr;delete p.objectLift;delete p.objectTarget;delete p.endpoints;
    if(learned){p.finishRefinements=SSTCopy(SSTOptional(learned.recipe,"finishRefinements",[]));p.preferenceGuided=true;p.preferenceSource=learned.sourceId;p.scenario="SHO blend with learned saturation and midtones";}
    p.duplicateUnresolved=false;continue;
   }
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
// Portable lossless PNG encoder: no disk files, plugins or external encoders.
function SSTBase64(bytes){var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",parts=[],part="";
 for(var i=0;i<bytes.length;i+=3){var a=bytes[i],b=i+1<bytes.length?bytes[i+1]:0,c=i+2<bytes.length?bytes[i+2]:0;
  part+=alphabet.charAt(a>>2)+alphabet.charAt(((a&3)<<4)|(b>>4))+(i+1<bytes.length?alphabet.charAt(((b&15)<<2)|(c>>6)):"=")+(i+2<bytes.length?alphabet.charAt(c&63):"=");if(part.length>=4096){parts.push(part);part="";}}
 if(part.length)parts.push(part);return parts.join("");
}
function SSTPNG(image){
 var W=image.width,H=image.height,C=image.numberOfChannels;if(W<1||H<1||W>600||H>400||(C!=1&&C!=3))throw new Error("Invalid embedded preview geometry.");
 var raw=[];for(var y=0;y<H;y++){raw.push(0);for(var x=0;x<W;x++)for(var c=0;c<C;c++)raw.push(Math.round(SSTClamp(image.sample(x,y,c),0,1)*255));}
 var z=[120,1];for(var at=0;at<raw.length;){var n=Math.min(65535,raw.length-at),last=at+n==raw.length;z.push(last?1:0,n&255,n>>8,(~n)&255,((~n)>>8)&255);for(var j=0;j<n;j++)z.push(raw[at++]);}
 var a=1,b=0;for(var i=0;i<raw.length;i++){a=(a+raw[i])%65521;b=(b+a)%65521;}
 function u32(out,v){out.push((v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255);}
 u32(z,((b<<16)|a)>>>0);var png=[137,80,78,71,13,10,26,10];
 function chunk(name,data){u32(png,data.length);var body=[];for(var k=0;k<4;k++)body.push(name.charCodeAt(k));for(k=0;k<data.length;k++)body.push(data[k]);
  var crc=0xffffffff;for(k=0;k<body.length;k++){crc^=body[k];for(var bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);png.push(body[k]);}u32(png,(crc^0xffffffff)>>>0);}
 var header=[];u32(header,W);u32(header,H);header.push(8,C==1?0:2,0,0,0);chunk("IHDR",header);chunk("IDAT",z);chunk("IEND",[]);
 return {mimeType:"image/png",encoding:"base64",width:W,height:H,channels:C,bitsPerChannel:8,byteLength:png.length,data:SSTBase64(png)};
}
function SSTCaptureComparison(session,working){
 delete session.comparisonPreviews;
 if(session.stage!="complete"||!session.finalComparison||session.finalComparison.selected!="user"||SSTSameSettings(session.userFavorite,session.autoPath.finalWinner))return;
 var userImage=null,trainerImage=null;
 try{userImage=SSTProcess(working,session.userFavorite);trainerImage=SSTProcess(working,session.autoPath.finalWinner);
  var user=SSTPNG(userImage),trainer=SSTPNG(trainerImage);if(user.data==trainer.data)return;
  session.comparisonPreviews={schema:"smart-stretch-comparison-previews-1",sourceFingerprint:session.fingerprint,captured:new Date().toISOString(),scope:"exact working comparison previews before further Quick Stretch edits",userRecipe:SSTCopy(session.userFavorite),trainerRecipe:SSTCopy(session.autoPath.finalWinner),user:user,trainer:trainer};
 }finally{if(userImage)userImage.free();if(trainerImage)trainerImage.free();}
}
function SSTValidateComparisonPreviews(s){var p=s.comparisonPreviews;if(!p)return;
 if(p.schema!="smart-stretch-comparison-previews-1"||s.stage!="complete"||!s.finalComparison||s.finalComparison.selected!="user"||p.sourceFingerprint!=s.fingerprint||JSON.stringify(p.userRecipe)!=JSON.stringify(s.userFavorite)||JSON.stringify(p.trainerRecipe)!=JSON.stringify(s.autoPath.finalWinner))throw new Error("Embedded comparison does not match the final choice.");
 var images=[p.user,p.trainer];for(var i=0;i<images.length;i++){var v=images[i];
  if(!v||v.mimeType!="image/png"||v.encoding!="base64"||v.width<1||v.height<1||v.width>600||v.height>400||v.width%1||v.height%1||v.width!=s.stats.width||v.height!=s.stats.height||v.channels!=s.stats.channels.length||v.bitsPerChannel!=8||typeof v.data!="string"||v.data.length>1100000||v.data.length%4||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(v.data)||v.byteLength<67||v.byteLength>800000||v.data.length!=4*Math.ceil(v.byteLength/3))throw new Error("Invalid embedded comparison PNG.");
 }
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
 var value=SSTQualitySourceUncached(image);value.backgroundPoints=SSTBackgroundPoints(image);value.channelHighlights=SSTChannelHighlightSource(image,value);value.structure=SSTStructure(image,value);value.ghsReferenceSamples=SSTGHSReferenceSamples(image,value);SSTSourceCacheImage=image;SSTSourceCacheValue=value;return value;
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
// Each channel gets its own coherent bright-region samples. This catches
// red filaments even when green-dominated luminance has ample detail.
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
   if(clipped/n>.02)warning=(refs.length==1?"Mono":["Red","Green","Blue"][c])+" highlights clipped";
   else if(median>.90&&spread<.045)warning=(refs.length==1?"Mono":["Red","Green","Blue"][c])+" highlight detail washed out";
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
// Calibrated from the user's paired M42 linear and preferred render, 2026-10-12.
// Deliberately excludes galaxies, clusters, stellar fields and narrowband palettes.
function SSTM42ReferencePreference(source,quality){
 var none={version:1,profile:"M42 paired reference",eligible:false,scoreAdjustment:0,distance:null,acceptedHighlightTradeoff:false};
 if(!source.structure||source.structure.type!="extended"||SSTOptional(source,"palette","Broadband RGB")!="Broadband RGB"||source.channels!=3)return none;
 var hdr=SSTHDRAssessment(source);
 if(!hdr.eligible||hdr.tailToMedian<50||hdr.coreToNebula<12||hdr.coreFraction<.004||hdr.coreFraction>.025)return none;
 // Broad source similarity gate: prevents teaching all extended objects this look.
 var sourceDistance=Math.abs(Math.log(hdr.tailToMedian/337.70))/Math.log(8)+Math.abs(Math.log(hdr.coreToNebula/34.25))/Math.log(4);
 if(sourceDistance>1.5)return none;
 var r=quality.regional,b=quality.backgroundQuality;
 if(!r||r.core.count<12||r.diskOrNebula.count<12||r.outskirts.count<12||b.sampleCount<24)return none;
 var actual=[b.median,r.core.median,r.core.spread,r.diskOrNebula.median,r.diskOrNebula.spread,r.outskirts.median,r.outskirts.spread];
 var target=[.10037,.88815,.20914,.81915,.19580,.46570,.38411];
 var tolerance=[.055,.16,.14,.20,.16,.20,.22],weights=[2,1,2,1,1,2,1],distance=0,total=0;
 for(var i=0;i<actual.length;i++){distance+=weights[i]*Math.min(3,Math.abs(actual[i]-target[i])/tolerance[i]);total+=weights[i];}
 distance/=total;
 var fit=SSTClamp(1-sourceDistance/1.5,0,1),adjustment=fit*(100-130*distance);
 // Accept only the reference's bounded highlight tradeoff with useful tonal spread.
 // Never excuse background/noise, all-channel washout or broad shadow clipping.
 var accepted=distance<.75&&r.core.spread>=.12&&r.diskOrNebula.spread>=.10&&
  r.core.clippedFraction<=.34&&quality.addedClipping<=.008&&quality.addedBlack<=.02&&
  b.median<=.16&&quality.noiseProminence<.08;
 if(accepted){adjustment+=fit*(2200*quality.addedClipping+160*r.core.clippedFraction+quality.channelHighlights.penalty);}
 return {version:1,profile:"M42 paired reference",eligible:true,sourceDistance:sourceDistance,distance:distance,scoreAdjustment:adjustment,acceptedHighlightTradeoff:accepted,referenceFeatures:target};
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
 var preferred=SSTM42ReferencePreference(source,{regional:regional,backgroundQuality:sky,channelHighlights:channelQuality,addedClipping:clip,addedBlack:crushed,noiseProminence:noiseProminence});
 score+=preferred.scoreAdjustment;
 if(preferred.acceptedHighlightTradeoff&&(warning=="Bright-core clipping"||warning=="Highlight clipping"||/^(Red|Green|Blue) highlight detail washed out$/.test(warning)))warning="";
 var ghs=SSTGHSReferenceQuality(image,source);if(ghs){score+=ghs.scoreAdjustment;if(ghs.rgbRMSE<.025&&clip<.003&&crushed<.01&&(warning=="Faint overall signal"||warning=="Bright core washed out"))warning="";}
 var narrowbandQuality=null;
 if((palette=="SHO"||palette=="HOO")&&!stellar&&image.numberOfChannels==3){
  var chroma=[],hues=[],green=0,colored=0,hueBins=[];for(var hb=0;hb<12;hb++)hueBins.push(0);var nbPoints=source.signalPoints||[];
  for(var ni=0;ni<nbPoints.length;ni++){var pt=nbPoints[ni],rgb=[];for(var nc=0;nc<3;nc++)rgb.push(image.sample(pt.x,pt.y,nc));var peak=Math.max.apply(null,rgb),low=Math.min.apply(null,rgb);if(peak>.01)chroma.push((peak-low)/peak);
   if(peak>.05&&peak-low>.08*peak){var delta=peak-low,hue=peak==rgb[0]?(rgb[1]-rgb[2])/delta:peak==rgb[1]?2+(rgb[2]-rgb[0])/delta:4+(rgb[0]-rgb[1])/delta;hue=(hue+6)%6;hueBins[Math.min(11,Math.floor(hue*2))]++;colored++;if(rgb[1]>1.15*Math.max(rgb[0],rgb[2]))green++;}}
  chroma.sort(function(a,b){return a-b;});var saturation=chroma.length?SSTPercentile(chroma,.5):0;
  var regionMedian=regional&&regional.diskOrNebula?regional.diskOrNebula.median:measuredSignal;
  var flat=separation<.008,dim=measuredSignal<.24||regionMedian<.18||signalContrast<.07;
  var penalty=flat?180:0;penalty+=70*(1-SSTClamp(measuredSignal/.35,0,1))+90*(1-SSTClamp(regionMedian/.28,0,1));
  penalty+=chroma.length>=24?65*(1-SSTClamp(saturation/.18,0,1)):0;
  var greenFraction=green/Math.max(1,colored),dominantHueFraction=0,hueEntropy=0;
  for(var hb=0;hb<12;hb++){var fraction=hueBins[hb]/Math.max(1,colored);dominantHueFraction=Math.max(dominantHueFraction,fraction);if(fraction>0)hueEntropy-=fraction*Math.log(fraction)/Math.log(12);}
  var colorPenalty=0;if(palette=="SHO"&&chroma.length>=24){colorPenalty=80*SSTClamp((saturation-.70)/.25,0,1);if(colored>=24)colorPenalty+=85*SSTClamp((greenFraction-.40)/.45,0,1)+45*SSTClamp((dominantHueFraction-.65)/.30,0,1);}
  penalty+=colorPenalty;score-=penalty;
  if(palette=="SHO"&&colored>=24&&greenFraction>.65)warning="SHO green dominance";
  else if(palette=="SHO"&&saturation>.85&&dominantHueFraction>.75)warning="SHO color separation lost";
  else if(flat)warning="Nearly flat narrowband render";else if(dim&&!warning)warning="Narrowband signal too faint";
  else if(chroma.length>=24&&saturation<.035&&!warning)warning="Narrowband color collapsed";
  narrowbandQuality={medianSaturation:saturation,greenFraction:greenFraction,dominantHueFraction:dominantHueFraction,hueEntropy:hueEntropy,colorPenalty:colorPenalty,signalMedian:measuredSignal,regionMedian:regionMedian,flat:flat,penalty:penalty};
 }
 return {version:17,narrowbandQuality:narrowbandQuality,pairedGHSReference:ghs,referencePreference:preferred,backgroundQuality:sky,noiseProminence:noiseProminence,noisePenalty:noisePenalty,palette:palette,paletteQuality:paletteQuality,regional:regional,stellarQuality:stellarQuality,structure:source.structure?source.structure.type:"extended",channelHighlights:channelQuality,objectQuality:objectQuality,visibility:{eligible:visibility>=.40,adequacy:visibility,signalMedian:measuredSignal,signalAboveBackground:signalContrast,sampleCount:signalValues.length},score:score,warning:warning,addedClipping:clip,addedBlack:crushed,signalSeparation:separation,noiseEstimate:noise,backgroundMedian:b?b.median:null,brightCore:core};
}
function SSTDetectedStructure(reference){
 var shape=reference.structure?reference.structure.type:"extended";
 if(shape=="cluster")return "Detected structure: Globular-cluster-like concentration of stars — existing stretch protection retained";
 if(shape=="starField")return "Detected structure: Dispersed star field — nebular HDR protection disabled";
 if(shape=="galaxy")return "Detected structure: Elongated galaxy-like object — conventional, core-protected and spatial hybrid candidates";
 if(shape=="extended"&&reference.structure&&reference.structure.peakCount>=100&&!SSTHDRAssessment(reference).eligible)return "Detected structure: Extended nebulosity with bright knots — no concentrated HDR core detected";
 if(SSTHDRAssessment(reference).eligible)return "Detected structure: Concentrated bright core with faint surroundings — HDR protection enabled";
 if(SSTOptional(reference,"compactSignal",false))return "Detected structure: Concentrated bright nebular structure with faint surroundings — compact-object protection enabled";
 if((reference.signalPoints||[]).length<12)return "Detected structure: No clear extended object detected — general stretch comparison";
 var bg=reference.background.statistics?reference.background.statistics.median:0;
 if(reference.luminance.p90-bg<8*Math.max(1e-7,reference.noise.sigmaEstimate||0))return "Detected structure: Predominantly faint extended signal — no concentrated HDR core detected";
 return "Detected structure: Extended signal across the field — no concentrated HDR core detected";
}
function SSTFingerprint(image){
 var h=2166136261,C=image.numberOfChannels;
 for(var y=0;y<19;y++)for(var x=0;x<23;x++)for(var c=0;c<C;c++){
  var v=image.sample(Math.min(image.width-1,Math.floor(x*image.width/23)),Math.min(image.height-1,Math.floor(y*image.height/19)),c);
  var q=isFinite(v)?Math.round(SSTClamp(v,0,1)*1e8):0;h=((h^q)*16777619)>>>0;
 }return image.width+"x"+image.height+"x"+C+":"+h;
}
function SSTDistance(a,b){
 return Math.abs(Math.log((a.median+1e-6)/(b.median+1e-6)))+Math.abs(Math.log((a.sigma+1e-6)/(b.sigma+1e-6)))+.5*Math.abs(a.p90-b.p90);
}
function SSTPreferenceScores(dataset,target,stats){
 var scores={},counts={},sessions=dataset.sessions||[];
 for(var i=0;i<sessions.length;i++){var s=sessions[i];if(s.target!=target||s.stage!="complete"||!s.finalWinner||!s.stats)continue;
  var w=1/(1+SSTDistance(stats.luminance,s.stats.luminance));var id=s.finalWinner.rootId||s.finalWinner.id;scores[id]=(scores[id]||0)+w;counts[id]=(counts[id]||0)+1;
 }
 return {scores:scores,counts:counts};
}
// PJSR warns on reads of missing properties, even in truthiness checks.
function SSTOptional(object,key,fallback){return object&&Object.prototype.hasOwnProperty.call(object,key)?object[key]:fallback;}
// Preference observations are relative choices, not absolute good/bad labels.
function SSTPreferenceVector(q){
 if(!q||!SSTOptional(q,"visibility",null))return null;
 var v=q.visibility,c=SSTOptional(q,"brightCore",null)||{median:0,p90MinusP10:0,nearWhiteFraction:0,clippedFraction:0};
 var a=[q.backgroundMedian/.15,v.signalMedian/.25,v.signalAboveBackground/.10,
  q.signalSeparation/.35,(c.median||0), (c.p90MinusP10||0)/.25,
  c.nearWhiteFraction||0,c.clippedFraction||0];
 for(var i=0;i<a.length;i++)if(!isFinite(a[i]))return null;return a;
}
function SSTPreferenceSimilarity(a,b){var d=0;for(var i=0;i<a.length;i++)d+=Math.pow(a[i]-b[i],2);return Math.exp(-d/a.length*2);}
// Learn from an explicit playoff favorite while the final comparison is pending.
// A completed comparison remains authoritative, including a trainer-side choice.
function SSTLearningRecipe(s){
 if(SSTOptional(s,"automatic",false))return null;
 if(s.stage=="complete")return SSTOptional(s,"finalWinner",null);
 if(s.stage!="compare"||!SSTOptional(s,"userFavorite",null))return null;
 var events=s.choices||[],e=events.length?events[events.length-1]:null;
 if(!e||e.stage!="playoff"||!e.indices||e.indices.length!=1||!e.offered||e.offered[e.indices[0]]!=s.userFavorite.id)return null;
 return s.userFavorite;
}
// Negative comments qualify a forced choice; they are not endorsements.
function SSTChoiceEvidence(note){
 var text=String(note||"").toLowerCase();
 if(/^(?:ugh+|ew+w*)[.!\s]*$|least offensive|all these crap|all\s+suck|all were bad|didn['’]?t like any|none.*(?:good|great)|all.*bad|most.*flat/.test(text))return 0;
 if(/flat|not very vibrant|overstretched|weird background/.test(text))return .35;
 if(/faint|slightly more faint/.test(text))return .7;
 return 1;
}
// Built-in profile derived from Don's explicit M42 choices, 2026-10-12.
var SST_BUILTIN_PREFERENCE={"target":"Mixed bright / faint nebula","palette":"Broadband RGB","starContent":"Starless","example":{"sourceId":"3996x3004x3:3348567308","weight":1,"stats":{"luminance":{"median":0.0007079677862813695,"sigma":0.00015639052045593864,"min":2.6452539935053207e-05,"max":0.9497080027222632,"p90":0.0020655037461733447,"p99":0.027036544657170872,"count":53200},"channels":[{"median":0.0007079718343447894,"sigma":0.00013864624186826405,"min":0.00010034407023340464,"max":0.9755080938339233,"p90":0.0018154269782826304,"p99":0.02880939789116384,"count":53200},{"median":0.0007064930978231132,"sigma":0.0001618849443853833,"min":4.9745167416404e-06,"max":0.9413036108016968,"p90":0.00211873766966164,"p99":0.026536255702376384,"count":53200},{"median":0.0007067514525260776,"sigma":0.00015922144773358014,"min":2.162903365388047e-05,"max":0.9569894671440125,"p90":0.002144800568930804,"p99":0.027275814432650865,"count":53200}]},"recipe":{"id":"f4v2","family":4,"variant":2,"target":0.18947748458735014,"black":[0],"shape":[4184.164208447592],"method":"asinh","second":0,"baseline":false,"scenario":"Extended nebula with gentle peak protection","finishGamma":1.0335813910617635,"preferenceGuided":true,"preferenceSource":"3996x3004x3:3348567308","highlightShoulder":0.88,"autoHighContrast":1,"endpoints":{"version":1,"black":0.039634730499995746,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"},"duplicateUnresolved":false},"rows":[{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"importance":0.01282051282051282},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"importance":0.01282051282051282},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"importance":1.5},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"importance":1.5},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8803902806093297,2.6530000481843947,5.311914699546992,0.40675665670718486,0.6536356085717678,0.8323771361565595,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6376141825616359,2.6312809490442275,5.621781098768115,0.39907844516634955,0.6466008065521718,0.8878617823505399,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8293628119677305,2.7513303629159926,5.634281689338386,0.474229162357535,0.681499387282133,0.7299757207822801,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6884518030981224,2.5013719509840007,5.2207521728128174,0.3300175753780775,0.6192414837658404,1.0269713299560546,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9182544958492119,2.7689946792364117,5.545104954317211,0.4540393881593434,0.688078660696745,0.7568089037799837,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6000273394485315,2.4690750503540038,5.272646616712212,0.35179565018756065,0.6107049225330352,0.9882881636333467,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7615322284350793,2.714996336817741,5.645192499391733,0.4131598173924857,0.6692579813301562,0.8553305792808534,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7566089516778787,2.5623078786611555,5.27085626913607,0.39179387040734304,0.6302215139865875,0.8732908693885801,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8793627070436876,2.652943883633614,5.313315648518504,0.40673484127862136,0.6536071085751056,0.8327181761455535,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6386224933067958,2.631448611831665,5.620687789618969,0.39900787456291065,0.6466097269237041,0.8877103286695487,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8287805527498325,2.749967510128021,5.631747946195303,0.47367259913682963,0.6811139894485474,0.7311329481935505,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6890413592159748,2.5022272219657893,5.222006016090511,0.33063130052260004,0.6194563613533973,1.0253610450744626,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.9169331701795258,2.7682928313732145,5.5453323231637475,0.45358165915438126,0.6876791796743869,0.7577232663583757,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6013547029246887,2.4708485134124754,5.275089229144155,0.3521259673305921,0.6111097946763039,0.9868594189357767,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7615114181637763,2.714596874761581,5.644225059658289,0.4130659354822976,0.6690913396954536,0.8553801086044315,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.756629168689251,2.5629568625450134,5.2724484033286565,0.3918664524350847,0.630421896469593,0.8730738346052171,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8758944139232239,2.6527531977653505,5.31804137352854,0.4066444178836686,0.6535099456250668,0.8338810686349873,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6421387485762436,2.63181177341938,5.616321310684085,0.3992107728242877,0.64669370316267,0.8872591014289855,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.8267974625229835,2.7453225910425183,5.62311028382182,0.4717735910858429,0.6800002728581429,0.7344148640537265,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6910272425462803,2.5049969139099124,5.22595142095536,0.3326428148380348,0.6201235015034676,1.019252788610459,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.912451484883825,2.7659065181016924,5.546089067928493,0.45202493296776536,0.6867361125528813,0.7611228494977955,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.6058679354836544,2.4767295022726055,5.283021852456032,0.3532483236483168,0.6124899299442768,0.9833468289089207,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7614407558540504,2.713238687491417,5.640935584947467,0.4127466407452312,0.6685864703536033,0.8554784774351116,0,0],"importance":0.125},{"selected":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"alternative":[0.7566978971262772,2.565163289761543,5.277861378714441,0.39211320021663404,0.6311030002951621,0.872196476073265,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.980244006305933,2.5280531563639634,4.849766881451009,0.3464900174830643,0.6224383056282997,0.845499108567239,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7282905598133803,2.499213354897499,5.155597547523676,0.34669973096762396,0.6142233064234257,0.904821834464073,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9425902092705171,2.629087474751472,5.158833372972904,0.4058362685799598,0.6505327951669693,0.7526058248853693,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7656518122752508,2.3836039042711255,4.810532042264938,0.28352112711327476,0.5899771453261375,1.042545444419385,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.028182546089093,2.6479405520677566,5.077577561035752,0.38627795432891177,0.6566460477143525,0.7815971307659164,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6801365498801073,2.353836666202545,4.864386840686201,0.30431172114866134,0.5830264077007771,1.007949652752876,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8583455930550895,2.577998154830933,5.157476997494698,0.3553765553644727,0.6360770095467567,0.8606201036214829,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8499103917429844,2.447914370775223,4.84492033932358,0.33475562944752846,0.6001343852609395,0.8862952026176458,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9792260686059794,2.527850731420517,4.8507877256423235,0.34647284532061645,0.6224064529418945,0.8458057260990146,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7293301594058673,2.4995051909685135,5.154767738312482,0.3464797558716369,0.614285724979639,0.9046648237180714,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9418547870218752,2.627588178300858,5.156188265219332,0.4053331964203291,0.6501111288428305,0.7534134353065496,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7663392141461373,2.3850353477716446,4.813079548209905,0.2837626718589244,0.5901679437935352,1.0409565901017195,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.0267224554916223,2.6468221455574037,5.076971680656076,0.3859354970651016,0.6562490122556686,0.7825588380622879,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6815107235809168,2.355389279580116,4.866207113578915,0.3047082429008825,0.583311549592018,1.0066703757834434,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8583110384444397,2.5775867082595827,5.156500212982298,0.3553097692574774,0.6359029010772705,0.8605641841316225,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8499425523430109,2.4484098918914796,4.846110901214183,0.33482232233541354,0.6002908720105886,0.8861841910171515,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9757691933512688,2.526957195973396,4.853739199906586,0.34610826110626985,0.6222981848061084,0.8468923729276665,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.732809967547655,2.500496796774864,5.152027040615677,0.34582760240350524,0.6144979218482971,0.9039233361434937,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.9393199862887462,2.6219065733909606,5.1457864540442815,0.40363535919189464,0.6491026434242726,0.7566386957407008,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.7688802192608516,2.3899099880456918,4.821454641222951,0.28552304304667947,0.5913480512857436,1.036190541172028,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[1.0217614650626978,2.645204461479187,5.0803689561039205,0.38475646525025403,0.6550277028024196,0.7854101605415358,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.6864509210636218,2.35939399971962,4.868808617703617,0.30596988702586714,0.5843365283429622,1.0029464715838432,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.8581900224039951,2.576187727594376,5.153184285379947,0.35508583748596056,0.6353181699216366,0.8603658134603505,0,0],"importance":0.125},{"selected":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"alternative":[0.850051762993137,2.4500944893598557,4.850158578909934,0.3350595625434605,0.6008594600647688,0.8857238853740697,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8450167716493211,2.164109123849869,4.142747652150691,0.24766644032001503,0.5294626443147659,1.0495835607600223,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6132940457041064,2.0824371099472043,4.286151706311851,0.23196823286839904,0.5114116945385934,1.1624790650892265,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7969711072891951,2.3118209282398223,4.584095659665763,0.2837285287993296,0.5700384584546089,0.9569934210157398,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6615362159013748,1.9229293023586271,3.815018932044506,0.19518010069940783,0.4716594537198543,1.2428917278790474,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8815984161396822,2.321790754914284,4.482079263076186,0.2741193970118253,0.5715539670109748,0.9958649786329268,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5766083209315935,1.9125085468411445,3.916358885705471,0.20430597865836977,0.46880488521456715,1.1980208461236963,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7313976862529913,2.1965889667749403,4.394375887557864,0.2452275818424564,0.5376568047404289,1.127438045759201,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7265952517936627,2.0556626179695128,4.049263667233288,0.2350271145701408,0.5034637279182672,1.0931854597139363,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.844042298540473,2.1638795547246934,4.143635439001024,0.24758097943408167,0.5294085963010787,1.0501358156466496,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6142004980991284,2.0826969852924346,4.285441716082394,0.2320653152951172,0.511484718248248,1.1619845637750625,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7963949465453625,2.3107392380475997,4.582255675300956,0.28333322363751284,0.5696377854645253,0.9576027066946038,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6621129994541407,1.9244622324585914,3.817986081965268,0.19555929465889943,0.47196788511276244,1.2415158611631396,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8803330677052339,2.3200083095788955,4.479521172389387,0.27381879983501795,0.5710714405179024,0.9962858537387846,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.5778246174057324,1.9140716107606885,3.9184421007931225,0.20456982924682768,0.46927604316174976,1.1970819131970418,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7313754733055831,2.1959991038322446,4.392934549622237,0.2451962331005506,0.5375176852196455,1.1273124995660784,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7266179143637418,2.056303462052345,4.05083178358525,0.23505661013296678,0.5036173341214656,1.0934221590352067,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8407442458818356,2.163098599076271,4.1466301288679235,0.24732003190474855,0.5292247879564762,1.0518990709996228,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6173140070537727,2.0832898841381073,4.282253699764609,0.23237734426174853,0.5116785080403089,1.160305624008179,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7945322436342638,2.3070611127138134,4.575854416333138,0.2819805625200274,0.5680275223910809,0.9606001393675814,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.6640393657237291,1.9292817335367203,3.827145285256207,0.19682850173690497,0.4734644574224949,1.2369518558073047,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.8760490927249193,2.3139454976320266,4.4707901049926875,0.27290964588608074,0.5696448327183723,0.9974578721952443,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.58202751254042,1.9193810381174088,3.925411326482892,0.20567188614606874,0.4708587865322828,1.1945619445300122,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7312734735111396,2.1939941799402236,4.388075239583849,0.24508561297314505,0.5370446113944053,1.12677227739811,0,0],"importance":0.125},{"selected":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"alternative":[0.7266950738032659,2.0584819673299792,4.056162307620049,0.23515680685979976,0.5041394177109002,1.094254558935166,0,0],"importance":0.125}],"absoluteRatings":[{"vector":[0.36110186094790697,2.435593863987923,5.547331868547946,0.6944183478168082,0.6059896332919598,0.7647036478042608,0,0],"value":-1},{"vector":[0.34248964038242896,2.575198031020164,5.924260616976766,0.659789208162683,0.6427039157032967,0.7563097980260851,0,0],"value":-1},{"vector":[0.7590599722911915,2.646063158416748,5.476567937605082,0.402506776860782,0.6501969104468822,0.8601880595684053,0,0],"value":1},{"vector":[0.42647848791380727,2.50533420214653,5.6236177734956145,0.702261645486525,0.6238024650812148,0.8090159055757526,0,0],"value":-1},{"vector":[0.40086497775216895,2.642317334461212,6.004495869524776,0.7289945202674196,0.6588516881614923,0.7964123822927478,0,0],"value":-1},{"vector":[0.686996323376894,3.3710851091384884,7.39721828778088,1.1383683252300538,0.8517694919466972,1.0333527738952633,0,0],"value":-1},{"vector":[0.5175762791881959,2.565428293967247,5.637206316135823,0.6509437065865316,0.6384245144844054,0.8634756714248657,0,0],"value":-1},{"vector":[0.5348514752238989,2.7060666696786875,5.96288946136087,0.729516371071339,0.674645492964983,0.8366478055906303,0,0],"value":-1},{"vector":[0.706382800405224,3.74984237036705,8.315031725309789,0.9775640713896082,0.9363153170287608,0.09493966367244688,0,0],"value":-1},{"vector":[0.5093781223595142,2.4312604196071623,5.314083865478635,0.6395274344835968,0.605029189145565,0.7974750287008288,0,0],"value":-1},{"vector":[0.49177051650981113,2.572656656455994,5.693985866375268,0.616278771471127,0.6409220476865768,0.7844780393314372,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.906524582107862,3.909341905760765,8.413567891240119,1.0910726240413544,0.9751782167673111,0.16149082808494608,0.7174288179465056,0],"value":-1},{"vector":[0.5442879425535601,2.6338571244955062,5.768210897408426,0.6828811472432963,0.6562688152253628,0.8322327778911598,0,0],"value":-1},{"vector":[0.877532222226262,2.1464490833997725,4.049824375160038,0.22879058001169153,0.5258068023771048,1.014528413405419,0,0],"value":-1},{"vector":[0.6148138445566097,2.555940548610687,5.467630604691803,0.604959233621189,0.6342849213719368,0.9113279090499877,0,0],"value":-1},{"vector":[0.5806696495711804,2.676339860749245,5.819845177516341,0.6979481267188279,0.6672305540025234,0.8818905727529534,0,0],"value":-1},{"vector":[1.1062218312819798,3.7601423522949218,7.741023133814335,1.0318195264935508,0.9392101259708404,0.07200615932464594,0,0],"value":-1},{"vector":[0.6573147963335116,2.430295042228699,5.089765411071479,0.5832716179464544,0.6034611218571662,0.8272799223423006,0,0],"value":-1},{"vector":[0.6409048599302769,2.5623835362195972,5.444601550653578,0.576320030491693,0.6384037967741489,0.814972009239197,0,0],"value":-1},{"vector":[1.6503125018775464,3.7660655838489534,6.939695206806064,0.9920476980175292,0.9408731640398502,0.059369879155159566,0,0],"value":-1},{"vector":[0.5812639656513929,2.4691451788425445,5.300966998629272,0.6092653562596867,0.6134659438371657,0.9001149598979956,0,0],"value":-1},{"vector":[0.5599619204103946,2.59520365755558,5.648066263273358,0.6497379942757745,0.6467102929115295,0.8733265047645569,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.7134941731045643,2.54722303507328,5.297816328026353,0.5596523509187359,0.6320800778865814,0.9623401208591464,0,0],"value":-1},{"vector":[0.6820385909974575,2.660983427381515,5.629400681957601,0.6512811635834831,0.6629897273540497,0.9256608136892317,0,0],"value":-1},{"vector":[1.5491766013503074,3.391115744662285,6.15402445963025,0.9259995136550502,0.8574326736986636,1.0508464336109156,0,0],"value":-1},{"vector":[0.3611018676683307,2.435593923473358,5.547332007180899,0.6944183557501863,0.6059896286129951,0.764703675384522,0,0],"value":-1},{"vector":[0.34248964351415634,2.5749152019023898,5.923553539484739,0.6597892338446215,0.6424986440241336,0.7524888979434965,0,0],"value":-1},{"vector":[1.2138649975856146,3.542151474022865,7.034581188678741,0.9983940563661714,0.890035580933094,0.6730897517633432,0,0],"value":-1},{"vector":[0.426478477905194,2.505334182977676,5.6236177405864,0.7022616483288153,0.6238024769544601,0.8090158635663989,0,0],"value":-1},{"vector":[0.4008649794881543,2.6418847562789916,6.003414421465247,0.7289944906941495,0.6585986099362373,0.7943417344379422,0,0],"value":-1},{"vector":[0.9787098323305448,3.74755265147686,7.9008168801963325,0.9094325241650856,0.9356964414656161,0.09923088748455022,0,0],"value":-1},{"vector":[0.5175762621512016,2.5654283324241636,5.637206437833606,0.6509437022694521,0.6384245062291622,0.8634755289745328,0,0],"value":-1},{"vector":[0.5348514935324589,2.7037933169603345,5.957206052102149,0.7304725702072896,0.674355618929863,0.8348170671463016,0,0],"value":-1},{"vector":[0.9756081082522868,2.417549334216118,4.580461173161865,0.3176042061720577,0.5956864131093025,0.8334795943760875,0,0],"value":-1},{"vector":[0.509378132596612,2.431260363864899,5.3140837107673295,0.6395274577413294,0.6050291919350623,0.7974750628328326,0,0],"value":-1},{"vector":[0.4917705125510693,2.5711496630668638,5.690218388840555,0.6162787297461729,0.6407753252744675,0.7814539273166656,0,0],"value":-1},{"vector":[0.7291042173405488,2.1289627074241637,4.228750442549585,0.2400051332363061,0.5209418133556842,1.1068525639224056,0,0],"value":0.6},{"vector":[0.5695389105429252,2.5016219904661177,5.399746610350906,0.649263998416492,0.6226066806256771,0.8430731855821616,0,0],"value":-1},{"vector":[0.5442879300912222,2.6331525531291957,5.766449487686156,0.6828811759514475,0.6561608070254326,0.829252498211861,0,0],"value":-1},{"vector":[1.1740075874626636,3.7526006825923917,7.620490325286983,0.9408206463030417,0.9370333347082137,0.08707494822979012,0,0],"value":-1},{"vector":[0.6148138292382161,2.5559406087636947,5.467630778051912,0.6049592177833835,0.6342848987162113,0.9113279280138018,0,0],"value":-1},{"vector":[0.580669630229473,2.6773010481119153,5.822248174935578,0.6979481630257198,0.6671372173607348,0.879668476305008,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.6573148044347764,2.4302950947999955,5.089765530347823,0.5832715717656274,0.6034611193716526,0.8272798740005505,0,0],"value":-1},{"vector":[0.6409048668493827,2.562337795591354,5.4444871887043105,0.5763200614580091,0.6381985211789607,0.8099484709024432,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.5812639695852995,2.469145066571236,5.30096671205014,0.6092653633287975,0.6134659729003906,0.9001149928092964,0,0],"value":-1},{"vector":[0.5599618956943353,2.59535317158699,5.648440085425972,0.6497380201961315,0.6466754588127136,0.8693919285440455,0,0],"value":-1},{"vector":[1.2749423271814984,3.481106332755089,6.790352341115475,0.9250725790432532,0.8780536470293998,0.8366139589929578,0,0],"value":-1},{"vector":[0.7134941497544448,2.547223033928871,5.29781636019051,0.5596523119194167,0.6320800658762454,0.9623400911092759,0,0],"value":-1},{"vector":[0.6820385766973097,2.6602774409770964,5.627635737396776,0.6514122243404391,0.6625533582627774,0.9230958822345738,0,0],"value":-1},{"vector":[1.0372593505581218,3.7772812145233154,7.887314010471106,1.3179777270759858,0.9439014978110789,0.03942235377311709,0,0],"value":-1},{"vector":[0.42596070028344796,2.9219032037734984,6.665816959008574,0.9910192625565204,0.7310632918953897,0.768449248328209,0,0],"value":-1},{"vector":[0.3959657920151949,3.085955211496353,7.120939340718091,0.9363020679192888,0.7744967819333077,0.7447010347652432,0,0],"value":-1},{"vector":[0.8268025612135729,3.715464702105522,8.048457913443444,0.7533222282290459,0.9270565788507461,0.16924867725372295,0,0],"value":-1},{"vector":[0.5177955277413131,2.9219032037734984,6.528064717821776,0.9970531000835553,0.7310632918953897,0.768449248328209,0,0],"value":-1},{"vector":[0.47657845321297654,3.0859886109590526,7.000103847578167,1.0301259024867002,0.7745039927423001,0.7447010347652432,0,0],"value":-1},{"vector":[0.8542557297448317,2.5177920009374617,5.013096407726407,0.3458851662712438,0.6184641061961651,0.8754530829668052,0,0],"value":0.8},{"vector":[0.6748929167836903,2.912246161699295,6.268276029072701,0.9176144688572203,0.7286543294787406,0.7753324860000612,0,0],"value":-1},{"vector":[0.6145429435819387,3.0780029485225677,6.773192955933511,1.031445284533501,0.7725411721944808,0.75137152703762,0,0],"value":-1},{"vector":[0.5472192486623924,3.2324183604717254,7.260217028185725,1.211781020498276,0.8209009027600287,1.2785256896400448,0,0],"value":-1},{"vector":[0.5728058689534664,2.933304039931297,6.474051296398043,0.9326227674841884,0.7335155968129634,0.7973911497879036,0.01725625539257981,0],"value":-1},{"vector":[0.5423580811669428,3.100277121973037,6.937155683182179,0.8896652727229266,0.7767973614990711,0.7662658324003222,0.023295944779982744,0],"value":-1},{"vector":[1.235955516954263,3.736578801345825,7.487513727933168,0.8231722702758661,0.9325436836123466,0.11948732338428503,0,0],"value":-1},{"vector":[0.5683120237141848,2.9168188894987104,6.439579188175499,0.957832731842143,0.7293972524940968,0.8097143398761752,0,0],"value":-1},{"vector":[0.529064018095533,3.0863799255132673,6.922353786639868,1.0011662009537226,0.7733986936748027,0.7781081468582154,0,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1},{"vector":[0.7752965532640615,2.9168188894987104,6.129102393850683,0.8773082370996479,0.7293972524940968,0.8097143398761752,0,0],"value":-1},{"vector":[0.7158536441971858,3.086382368993759,6.642175456188619,0.9934637561968398,0.7733986936748027,0.7781081468582154,0,0],"value":-1},{"vector":[1.463112330923478,2.3786477724075317,3.751950934633612,0.23500587045294904,0.587020359814167,0.8345688527417194,0,0],"value":-1},{"vector":[0.5893330193112294,2.9321616810798643,6.446404673732817,0.8980439502596855,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"value":-1},{"vector":[0.561580579991142,3.0925676546573637,6.889048266656697,0.866912250609912,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"value":-1},{"vector":[1.010455885618925,3.550104345011711,7.35957703410089,0.7834714704002654,0.8911557978987694,0.6417371268224716,0,0],"value":-0.5},{"vector":[0.675982374255856,2.9321616810798643,6.316430641315876,0.9095069754498345,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"value":-1},{"vector":[0.637507611244917,3.0925676546573637,6.7751577197760335,0.957022054416793,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"value":-1},{"vector":[0.9130796102682748,3.7679053802013396,8.050144035100937,1.2095261068957193,0.9413762276709079,0.05651929059505445,0,0],"value":-1},{"vector":[0.873657112672925,2.9321616810798643,6.019918533690274,0.8328084647067957,0.7309745442926883,0.8508217488622662,0.05090595340811044,0],"value":-1},{"vector":[0.8172534084022045,3.0925676546573637,6.505539024040102,0.9565672345536095,0.7746880819261074,0.8106749814128875,0.0724762726488352,0],"value":-1},{"vector":[1.1910335074762501,2.823071399235725,5.2711282368749375,0.7148889926041883,0.7096776848852635,0.8018468473005296,0,0],"value":-1}]},"feedback":{"accepted":["f4v2","f4v5","f6v2"],"best":"f4v2","nearMiss":"f3v2","nearMissReason":"Red highlight detail washed out","origin":"Explicit user assessment of 0.5.34 initial grids and shortlist, 2026-10-12","completedSession":"SST-1791858315254-856952822","finalComparison":"same","retainedParentRefinements":9}};
var SST_BUILTIN_SHO_PREFERENCE={"target":"Emission nebula","palette":"SHO","starContent":"Starless","example":{"sourceId":"6233x4029x3:4209263392","weight":1,"stats":{"channels":[{"median":0.0016584860859438777,"sigma":4.134240048006177e-06,"min":0.0016410939861088991,"max":0.0017478804802522063,"p90":0.0016659205895848573,"p99":0.001674854791490361,"count":58200},{"median":0.0016553794266656041,"sigma":1.7396511108381676e-05,"min":0.0016008452512323856,"max":0.0019169432343915105,"p90":0.001689940714277327,"p99":0.0017166588187683372,"count":58200},{"median":0.0016564306570217013,"sigma":4.462117940420285e-06,"min":0.0016396548599004745,"max":0.001719861407764256,"p90":0.0016730912029743195,"p99":0.001691952069522813,"count":58200}],"luminance":{"median":0.0016562764329486526,"sigma":1.3501925322707827e-05,"min":0.0016123175854096188,"max":0.00186338194492273,"p90":0.0016829801918449812,"p99":0.0017037946623468304,"count":58200}},"recipe":{"id":"r0s2v3","family":7,"variant":5,"target":0.19479620060615924,"black":[0],"shape":[5.005482927071783e-05],"method":"mtf","second":0.2340425531914894,"baseline":false,"scenario":"Lift midtones","finishGamma":1.5,"shoRedLift":0.16,"luminanceGamut":true,"sourcePedestal":[0.0016469102138094605,0.0016066691955621355,0.0016439367267885245],"sourceGain":[1.0793078990592804,0.25649498986440034,1],"shoGamutShoulder":true,"autoHighContrast":1,"recipeBlend":{"version":1,"amount":0.5,"weights":[0.5,0.5],"recipes":[{"id":"f0v4","family":0,"variant":4,"target":0.15979620060615923,"black":[0.0016469102138094605,0.0016066691955621355,0.0016439367267885245],"shape":[2.7054507085001764e-05,0.00011383270431778906,2.9200020432734252e-05],"method":"mtf","second":0,"baseline":false,"scenario":"Restrained background","finishGamma":1.5231706358107882,"compactProtected":true,"shoRedLift":0.08,"autoHighContrast":0.5,"endpoints":{"version":1,"black":0,"white":0.870747281195712,"method":"linked sampled bounds with highlight margin and conservative background anchor"}},{"id":"f7v5","family":7,"variant":5,"target":0.19479620060615924,"black":[0],"shape":[5.005482927071783e-05],"method":"mtf","second":0.2340425531914894,"baseline":false,"scenario":"SHO channel-balanced signal with soft highlights","finishGamma":1.5,"shoRedLift":0.16,"luminanceGamut":true,"sourcePedestal":[0.0016469102138094605,0.0016066691955621355,0.0016439367267885245],"sourceGain":[1.0793078990592804,0.25649498986440034,1],"shoGamutShoulder":true,"autoHighContrast":1,"endpoints":{"version":1,"black":0,"white":1,"method":"linked sampled bounds with highlight margin and conservative background anchor"}}]},"duplicateUnresolved":false,"rootId":"f7v5","parentId":"r0s1v2","finishRefinements":[{"mode":0,"strength":-0.24},{"mode":0,"strength":-0.14},{"mode":1,"strength":0.08}]},"rows":[{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.9123997124930224,1.1315825801968575,1.4603568817526102,0.33053934223226156,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.8407600262363751,1.1723641170859336,1.6697702533602712,0.37911816157783784,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.5151474360426265,1.312433319401741,1.0083621444404127,0.23443928534473685,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.5723525229046743,0.8677057001948356,1.3107354661300776,0.2998629823178054,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.8063379459828139,1.3635779758810997,2.1994380207285285,0.500675346495424,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.6171803834637004,1.1084638653814793,0.34538908825814785,0.08048984171066952,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.9138419102430342,1.362682380324602,0.5359430854469538,0.12347917051570742,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.5483867202152808,0.8566816411554814,1.3191240225657823,0.29529588699596265,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.2886209297279516,1.4399524292230605,1.6669496784657238,0.38049329134225846,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.9737567538619039,1.6562441601037978,1.1799752694666388,0.27097844542946126,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.537978343506654,1.6200614332735537,1.743186067923903,0.40630726383413585,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.578696866095066,2.006401116764545,2.6479574927687635,0.6123355533787184,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.853993298649788,1.2547346487820148,0.3558466739803551,0.0828755632247242,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.5689866468111673,1.1578987348198888,0.5412668668329712,0.1250916102903231,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[0.5558526522467533,0.8463169958114624,1.2820135111585258,0.2877477333741528,0,0.0,0,0],"importance":0.125},{"selected":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"alternative":[1.4432863451838494,1.735813353908062,2.174603866994381,0.5004536794168609,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.267843457788229,1.4401279834508895,1.6985547719448806,0.3883362854259355,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.3641995281378427,1.6314492243051528,2.0323237685561177,0.4640911792976516,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.492025177896023,1.821479133915901,2.315660067945718,0.5345526307719094,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.4933218358655769,1.0453343712866308,0.3733531744182117,0.08535560716816351,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.3367985099554063,1.045789960503578,0.6092771363258359,0.1398370099501949,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[0.5560599342286586,0.865995981490612,1.3309000523835417,0.29819685914260996,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[1.454872665355603,1.8613803895950316,2.4711419759541746,0.5727668530549324,0,0.0,0,0],"importance":0.125},{"selected":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"alternative":[2.281726038654645,1.5751782816648483,0.5153566461801534,0.12081227925547557,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.5624934016962844,1.6805654241800307,1.8576734579056502,0.42355833007948734,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[2.6193206602334973,1.7511791518330573,0.44896688923239725,0.10329917982986991,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.6099469319482644,1.259215267020464,0.7331177696287633,0.16770237346036096,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[0.5574065954585871,0.8481147366225719,1.284176948368549,0.28826639130200654,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.501467422525088,1.7250468758225441,2.0604160557687283,0.47398000218868264,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.1848890192210675,1.6340557243943215,2.3078057821542024,0.5339991395047734,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.9138289300402005,1.3626902915239334,0.5359823337495329,0.12348823572014041,0,0.0,0,0],"importance":0.125},{"selected":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"alternative":[1.9931906329989433,1.78346836925745,1.4688849736452103,0.34473303661687027,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[2.7704447878400487,1.8552308813214302,0.4824100215435029,0.11018529298986708,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[2.3906755305727323,1.8146662378311156,0.9506522987186905,0.2207234341434071,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[0.5554063450743755,0.8265148005515336,1.2331774837672709,0.2787660489427192,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.4403844810426234,1.631067795109749,1.9170927662104376,0.437624727523327,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.6561351514160636,1.9609481785535812,2.4181677192598574,0.5680283452885492,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.5806850094596545,1.165165518090129,0.541886281035841,0.1252324958273341,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.6232325555781524,1.6077424678862093,1.5845073363482947,0.3673821378954818,0,0.0,0,0],"importance":0.125},{"selected":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"alternative":[1.5625368996759257,2.061277295851707,2.8093878901153793,0.6538036375624795,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[2.106882246275743,1.4890334818422795,0.5622603351920841,0.12841751410279958,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.6330734108487766,1.4220867881298065,1.1056068540513513,0.2543622697285243,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.5179801047941048,0.9300435327231884,0.04813867461681387,0.010806416272265577,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[0.9425304666062195,1.2127101325809955,1.6179796315431594,0.3670139589156423,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[0.87041002989312,1.3501963824748993,2.069875911347568,0.4751423191394126,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.3903400211582582,1.0743309650331736,0.600317380845547,0.13946697591883814,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.300862121562163,1.423291418594122,1.6069353641420603,0.371040076403107,0,0.0,0,0],"importance":0.125},{"selected":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"alternative":[1.0524277202586334,1.821495560443401,2.9750973207205527,0.6929887798786165,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[2.179634063541889,1.8030850900053979,1.238261629700661,0.28356117143971604,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[2.077956131776174,1.2655994708657263,0.04706447950005521,0.010610150441101427,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.5929386322398984,1.7334232348799703,1.9441501388400784,0.44664565904821696,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.3993725832402708,1.6402387614309788,2.001538028717041,0.4591517330706118,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.9261538240512215,1.4136229781389236,0.6448267092704768,0.14810106932946615,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.8894238273600736,1.8571172439336778,1.8086573687940843,0.4252394733258655,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[1.3416114602684974,1.774697797000408,2.424327302098274,0.5563319697311945,0,0.0,0,0],"importance":0.125},{"selected":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"alternative":[2.320011643052101,1.5401929260134697,0.370464850455523,0.08686117233378549,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.3588406043152013,0.830306585305929,0.03750555679202072,0.008477419492176619,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.2908371648192405,1.4713031634211537,1.7420021613240235,0.39671799040862477,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.4400022556583087,1.6623982383966442,1.9959922125041476,0.46200816940580086,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.414009977499644,1.1425734422445297,0.7354186393618584,0.16799824346942557,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.224179709980885,1.4181587677538394,1.7091273544132708,0.3952880902051925,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.3956814642250537,1.8518799486041067,2.536177675172686,0.586758963789259,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[1.9570572397609551,1.320121690762043,0.364718367263675,0.08486349277368625,0,0.0,0,0],"importance":0.125},{"selected":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"alternative":[2.2817268399596213,1.575177335882187,0.5153530797660355,0.12081140672564511,0,0.0,0,0],"importance":0.125},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.238824294000864,1.9113312619805334,2.9200917139500375,0.6833328978044645,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.0244674969315528,1.3346832645893096,1.8000069160759449,0.40972095191393587,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.6378466932574909,1.8340075188755987,2.12824875730276,0.48632975093637193,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.5775697017510733,1.9332271600484847,2.466713347494602,0.5686597008739201,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[0.8419380181183417,1.5062236647486686,2.502652134694159,0.572045524357898,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.2516680472989876,1.8910395113945007,2.8500967075377703,0.6634958536607877,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"alternative":[1.1907306139369807,1.830762964808941,2.790811491116881,0.6490974943229131,0,0.0,0,0],"importance":0.14285714285714285},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.8319396738111973,1.5465354148983954,2.6184290265291925,0.6078928557412965,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.9477841320087512,1.5826973118543626,2.5350670816227794,0.5869011926054957,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.9227456693152586,1.6964305912852287,2.856957974240184,0.6711450268157888,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.740449937671423,1.395606927394867,2.378342411980033,0.5486688575233732,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.9985141780177753,1.7057208494484426,2.7665308565944433,0.643555147601877,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.6648125258684159,1.3881027785956859,2.4730381576865907,0.5781282265952655,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.8365014395018419,1.5923691004276275,2.726170591816306,0.634210340663365,0,0.0,0,0],"importance":0.125},{"selected":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"alternative":[0.827173062602679,1.4990416850328445,2.506844618678093,0.5817484690725804,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7149452403634786,1.5102789454817773,2.703279503159225,0.6337171169298036,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7782887485424677,1.5302437297344207,2.65817620152235,0.6213221572160721,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7558056575854619,1.5939712585568429,2.851219660013914,0.6715689422939504,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.6732618016799291,1.4224372888207435,2.546200519531965,0.5942582601189613,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.8007057876487572,1.6005810872793198,2.800394036725163,0.6556413338550501,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.6289696952501933,1.4178232748508452,2.601103644251823,0.6114674540894374,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7167798477162918,1.536889383292198,2.7670536866560567,0.6494637441047599,0,0.0,0,0],"importance":0.125},{"selected":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"alternative":[0.7129596210767825,1.4828500432312488,2.6376856764629486,0.6190269877186845,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6507410469651222,1.4875255163013934,2.7427022203058002,0.6477253246128561,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6858709778736035,1.5008710435152053,2.7233711419776077,0.6404853474617004,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6151178888082504,1.473508716571331,2.7610949582159514,0.6528845213856018,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6312093437910081,1.4377483999371528,2.6475569841563695,0.6229135490425993,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6962705725431442,1.5402599169194697,2.8062439334839584,0.6605384863606523,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6045644719998042,1.4331588584303856,2.6760504380762575,0.632464076912403,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6513849225789308,1.5032546683251855,2.7810592869445676,0.6560162719973497,0,0.0,0,0],"importance":0.125},{"selected":[0.6696538584530353,1.5361229456424712,2.8358265764266246,0.669951921710798,0,0.0,0,0],"alternative":[0.6498569493691125,1.4727558817744253,2.707104280382394,0.6386343584460873,0,0.0,0,0],"importance":0.125}]},"origin":"Completed Elephant SHO session; user and automatic final recipe matched"};
function SSTBuildPreferenceModel(dataset,target,stats,labels){
 var model={version:1,examples:[],confidence:0},seen={},sessions=dataset.sessions||[];
 for(var i=sessions.length-1;i>=0&&model.examples.length<12;i--){var s=sessions[i];
  var learningRecipe=SSTLearningRecipe(s);
  if(!learningRecipe||s.target!=target||!s.stats||s.stats.channels.length!=stats.channels.length)continue;
  var key=s.fingerprint||s.id;if(seen[key])continue;seen[key]=true;
  var known=SSTOptional(s,"dataLabels",{}),mismatch=false;
  if((SSTOptional(labels,"palette","Broadband RGB")=="SHO")!=(SSTOptional(s,"palette","Broadband RGB")=="SHO"))continue;
  for(var k in labels)if(labels[k]!="Unspecified"&&SSTOptional(known,k,"Unspecified")!="Unspecified"&&known[k]!=labels[k])mismatch=true;
  if(mismatch)continue;
  var a=stats.luminance,b=s.stats.luminance,d=SSTDistance(a,b);
  // Tail/median ratio helps distinguish compact bright cores from uniform faint signal.
  d+=.5*Math.abs(Math.log((a.p99+1e-8)/(a.median+1e-8))-Math.log((b.p99+1e-8)/(b.median+1e-8)));
  var weight=Math.exp(-d)*(s.stage=="compare"?.75:1);if(weight<.1)continue;
  var rows=[],events=s.choices||[],ratings=SSTOptional(s,"qualityRatings",{});
  for(var j=0;j<events.length;j++){var e=events[j],q=SSTOptional(ratings,(e.offered||[]).join("|"),null);
   if(!q||!e.indices||!e.indices.length||q.length!=e.offered.length)continue;
   // Pairwise evidence preserves alternatives hidden by an average feature vector.
   var evidence=SSTChoiceEvidence(SSTOptional(e,"note","")),alternatives=q.length-e.indices.length;
   if(alternatives<=0||evidence<=0)continue;
   var importance=(e.stage=="compare"?4:e.stage=="playoff"?3:1)*evidence/(alternatives*e.indices.length);
   for(var t=0;t<e.indices.length;t++){var selected=SSTPreferenceVector(q[e.indices[t]]);if(!selected)continue;
    for(var r=0;r<q.length;r++)if(e.indices.indexOf(r)<0){var vector=SSTPreferenceVector(q[r]);if(vector)rows.push({selected:selected,alternative:vector,importance:importance});}
   }
  }
  model.examples.push({sourceId:key,weight:weight,stats:SSTCopy(s.stats),recipe:SSTCopy(learningRecipe),rows:rows});
 }
 // Loaded evidence for the same source supersedes the built-in example.
 var builtins=[SST_BUILTIN_PREFERENCE,SST_BUILTIN_SHO_PREFERENCE];
 for(var bi=0;bi<builtins.length;bi++){var builtin=builtins[bi],prior=builtin.example;
 var duplicate=model.examples.some(function(e){return e.sourceId==prior.sourceId;});
 var star=SSTOptional(labels,"starContent","Unspecified");
 if(!duplicate&&model.examples.length<12&&target==builtin.target&&SSTOptional(labels,"palette","Broadband RGB")==builtin.palette&&
    (star=="Unspecified"||star==builtin.starContent)&&stats.channels.length==prior.stats.channels.length){
  var a=stats.luminance,b=prior.stats.luminance,d=SSTDistance(a,b);
  d+=.5*Math.abs(Math.log((a.p99+1e-8)/(a.median+1e-8))-Math.log((b.p99+1e-8)/(b.median+1e-8)));
  var w=prior.weight*Math.exp(-d);
  if(w>=.1){var example=SSTCopy(prior);example.weight=w;model.examples.push(example);}
 }
 }
 var evidence=0;for(i=0;i<model.examples.length;i++)evidence+=model.examples[i].weight;
 model.confidence=evidence/(evidence+4);return model;
}
// Strong local evidence can correct a heuristic recommendation. Transfer fades
// rapidly with both source mismatch and rendered-feature distance.
function SSTPreferenceLocalSimilarity(a,b){
 var d=0;for(var i=0;i<a.length;i++)d+=Math.pow(a[i]-b[i],2);
 return Math.exp(-d/.002);
}
function SSTPreferenceAdjustment(model,q){
 var vector=SSTPreferenceVector(q),sum=0,weight=0,localSum=0,localWeight=0;
 if(!vector||!model||!model.examples.length)return 0;
 for(var i=0;i<model.examples.length;i++){var e=model.examples[i],value=0,total=0,positive=0,negative=0,localEvidence=0;
  for(var j=0;j<e.rows.length;j++){var importance=e.rows[j].importance;
   value+=importance*(SSTPreferenceSimilarity(vector,e.rows[j].selected)-SSTPreferenceSimilarity(vector,e.rows[j].alternative));total+=importance;
   var p=SSTPreferenceLocalSimilarity(vector,e.rows[j].selected),n=SSTPreferenceLocalSimilarity(vector,e.rows[j].alternative);
   positive+=importance*p;negative+=importance*n;localEvidence+=importance*(p+n);
  }
  if(total){sum+=e.weight*value/total;weight+=e.weight;}
  if(e.weight>=.5&&localEvidence>.01){
   var relevance=SSTClamp((e.weight-.5)/.25,0,1),support=SSTClamp(localEvidence/.15,0,1);
   var vote=(positive-negative)/localEvidence;
   // Explicit acceptable/unacceptable assessments supersede forced-choice votes.
   var anchors=SSTOptional(e,"absoluteRatings",null);
   if(anchors&&anchors.length){var nearest=0,rating=0;
    for(var k=0;k<anchors.length;k++){var match=SSTPreferenceLocalSimilarity(vector,anchors[k].vector);
     if(match>nearest){nearest=match;rating=anchors[k].value;}}
    vote=rating;support=nearest;
   }
   localSum+=e.weight*relevance*support*vote;
   localWeight+=e.weight;
  }
 }
 var general=weight?12*model.confidence*SSTClamp(sum/weight,-1,1):0;
 // Do not override the major damage checks for newly clipped or washed-out cores.
 var object=SSTOptional(q,"objectQuality",null),core=SSTOptional(q,"brightCore",null);
 var damaged=(object&&object.washedOut)||(core&&core.clippedFraction>.01)||SSTOptional(q,"addedClipping",0)>.01;
 var local=localWeight?80*SSTClamp(localSum/Math.max(1,localWeight),-1,1):0;
 return general+(damaged?Math.min(0,local):local);
}
// Only classify acceptance when explicit ratings closely match this source/render.
function SSTKnownAcceptance(model,q){
 var vector=SSTPreferenceVector(q),match=0,value=0;
 if(!model||!vector)return "unknown";
 for(var i=0;i<model.examples.length;i++){var e=model.examples[i],anchors=SSTOptional(e,"absoluteRatings",null);
  if(e.weight<.5||!anchors)continue;
  for(var j=0;j<anchors.length;j++){var similarity=SSTPreferenceLocalSimilarity(vector,anchors[j].vector)*SSTClamp((e.weight-.5)/.25,0,1);
   if(similarity>match){match=similarity;value=anchors[j].value;}}}
 if(match<.5)return "unknown";
 return value>0?"accepted":value>-.75?"nearMiss":"rejected";
}
function SSTQualityOrder(a,b){
 function category(q){var acceptance=SSTOptional(q,"learnedAcceptance","unknown");return acceptance=="rejected"?3:q.warning||acceptance=="nearMiss"?2:0;}
 return category(a)-category(b)||b.score-a.score;
}
function SSTApplyPreferences(model,qualities){
 for(var i=0;i<qualities.length;i++){var q=qualities[i];q.heuristicScore=q.score;
  q.preferenceAdjustment=SSTPreferenceAdjustment(model,q);q.score+=q.preferenceAdjustment;q.preferenceVersion=3;q.learnedAcceptance=SSTKnownAcceptance(model,q);}
}
function SSTPersonalizeCandidates(candidates,stats,model,groupIndex){
 if(!model||!model.examples.length)return candidates;
 // Only one candidate per grid is biased; other families remain exploratory.
 var templates=model.examples.slice().sort(function(a,b){return b.weight-a.weight;});
 for(var group=0;group<Math.ceil(candidates.length/9);group++){var e=templates[(groupIndex===undefined?group:groupIndex)%templates.length],prior=e.recipe;
  if(SSTOptional(prior,"recipeBlend",null)||SSTOptional(prior,"quick",false)||[3,4].indexOf(prior.family)<0||SSTOptional(prior,"selectiveMidtone",null)!==null||SSTOptional(prior,"hdrShape",null)!==null)continue;
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
function SSTValidatePreferenceModel(model,C){
 if(!model)return;if(model.version!==1||!isFinite(model.confidence)||model.confidence<0||model.confidence>1||!(model.examples instanceof Array)||model.examples.length>12)throw new Error("Invalid preference model.");
 for(var i=0;i<model.examples.length;i++){var e=model.examples[i];SSTValidateRecipe(e.recipe,C);
  if(!isFinite(e.weight)||e.weight<=0||e.weight>1||!e.stats||!e.stats.luminance||!isFinite(e.stats.luminance.median)||e.stats.luminance.median<=0||!(e.rows instanceof Array)||e.rows.length>600)throw new Error("Invalid preference example.");
  var anchors=SSTOptional(e,"absoluteRatings",null);
  if(anchors){if(!(anchors instanceof Array)||anchors.length>81)throw new Error("Invalid explicit quality ratings.");
   for(var n=0;n<anchors.length;n++){var rating=anchors[n];if(!isFinite(rating.value)||rating.value<-1||rating.value>1||!(rating.vector instanceof Array)||rating.vector.length!=8)throw new Error("Invalid explicit quality rating.");
    for(var f=0;f<8;f++)if(!isFinite(rating.vector[f])||Math.abs(rating.vector[f])>100)throw new Error("Invalid explicit quality feature.");}}
  for(var j=0;j<e.rows.length;j++){var row=e.rows[j];if(!isFinite(row.importance)||row.importance<=0||row.importance>4)throw new Error("Invalid preference importance.");for(var k=0;k<2;k++){var v=k?row.alternative:row.selected;if(!(v instanceof Array)||v.length!=8)throw new Error("Invalid preference observation.");for(var t=0;t<v.length;t++)if(!isFinite(v[t])||Math.abs(v[t])>100)throw new Error("Invalid preference feature.");}}
 }
}
function SSTLegacyGrid(session){if(session.stage=="final"||session.stage=="complete")return session.winners.slice();return session.candidates.slice(session.round*9,session.round*9+9);}
function SSTLegacyChoose(session,index,note){
 if(session.stage=="complete")throw new Error("Tournament is complete.");var grid=SSTLegacyGrid(session);if(index<0||index>=grid.length)throw new Error("Select a candidate first.");
 var choice={stage:session.stage,round:session.round,offered:grid.map(function(p){return p.id;}),winner:grid[index].id,note:String(note||""),time:new Date().toISOString()};
 session.choices.push(choice);
 if(session.stage=="final"){session.finalWinner=grid[index];session.stage="complete";session.completed=choice.time;}
 else{session.winners.push(grid[index]);session.round++;if(session.round==9)session.stage="final";}
}

function SSTLegacyValidateDataset(d){
 if(!d||d.schema!="smart-stretch-trainer-1"||!(d.sessions instanceof Array)||d.sessions.length>10000)throw new Error("Unsupported trainer dataset.");
 for(var i=0;i<d.sessions.length;i++){
  var s=d.sessions[i];if(!s||SST_TARGETS.indexOf(s.target)<0||!s.stats||!s.stats.luminance||!isFinite(s.stats.luminance.median)||!isFinite(s.stats.luminance.sigma)||!(s.candidates instanceof Array)||s.candidates.length!=81||!(s.choices instanceof Array)||!(s.winners instanceof Array))throw new Error("Invalid saved session.");
  if(!(s.stats.channels instanceof Array)||(s.stats.channels.length!=1&&s.stats.channels.length!=3))throw new Error("Invalid channel statistics.");
  var measured=[s.stats.luminance].concat(s.stats.channels);for(var si=0;si<measured.length;si++){var sm=measured[si];if(!sm||!isFinite(sm.median)||sm.median<0||sm.median>1||!isFinite(sm.sigma)||sm.sigma<0||sm.sigma>2||!isFinite(sm.p90)||sm.p90<0||sm.p90>1)throw new Error("Invalid image measurements.");}
  if(["round","final","complete"].indexOf(s.stage)<0||s.round<0||s.round>9||s.round%1||s.winners.length!=s.round||s.choices.length!=(s.stage=="complete"?10:s.round))throw new Error("Invalid saved tournament state.");
  var map={},ids={};for(var k=0;k<81;k++){var p=s.candidates[k];
   if(!p||p.family<0||p.family>8||p.family%1||p.variant<0||p.variant>8||p.variant%1||p.id!="f"+p.family+"v"+p.variant||ids[p.id]||!(p.black instanceof Array)||!(p.shape instanceof Array)||["mtf","asinh","log","gamma"].indexOf(p.method)<0||!isFinite(p.target)||p.target<=0||p.target>=1||!isFinite(p.second)||p.second<0||p.second>1)throw new Error("Invalid recipe.");
   var n=p.family<3?s.stats.channels.length:1;if((n!=1&&n!=3)||p.black.length!=n||p.shape.length!=n)throw new Error("Recipe channel mismatch.");
   for(var c=0;c<n;c++)if(!isFinite(p.black[c])||p.black[c]<0||p.black[c]>=1||!isFinite(p.shape[c])||p.shape[c]<0||p.shape[c]>1e12)throw new Error("Invalid recipe values.");
   map[p.id]=p;ids[p.id]=true;
  }
  for(k=0;k<s.winners.length;k++){if(!s.winners[k]||!map[s.winners[k].id])throw new Error("Unknown group winner.");s.winners[k]=map[s.winners[k].id];}
  if(s.stage=="round"&&s.round>=9||s.stage!="round"&&s.round!=9)throw new Error("Invalid round count.");
  // Rebuild state from recorded choices. Imported recipes are data only, never evaluated.
  var replay={candidates:s.candidates,stage:"round",round:0,winners:[],choices:[]};
  for(k=0;k<s.choices.length;k++){var ch=s.choices[k],g=SSTLegacyGrid(replay),off=g.map(function(p){return p.id;}),at=off.indexOf(ch.winner);
   if(at<0||ch.stage!=replay.stage||ch.round!=replay.round||JSON.stringify(ch.offered)!=JSON.stringify(off))throw new Error("Invalid preference history.");SSTLegacyChoose(replay,at,ch.note);
  }
  if(replay.stage!=s.stage||JSON.stringify(replay.winners.map(function(p){return p.id;}))!=JSON.stringify(s.winners.map(function(p){return p.id;})))throw new Error("Inconsistent winners.");
  if(s.stage=="complete"){if(!s.finalWinner||s.finalWinner.id!=replay.finalWinner.id)throw new Error("Invalid final winner.");s.finalWinner=map[s.finalWinner.id];}
 }return d;
}
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
// Version 4 refines the finished parent, retaining its calibrated pipeline.
function SSTFinishedRefine(s,parent){
 var width=s.refineAlgorithm==5?(s.refineWidths[s.branch+":"+s.refineStep]||0):0;
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
function SSTFinalistBlendGrid(originals){
 var g=originals.map(SSTCopy);if(originals.length<2)return g;
 function blend(id,recipes,weights,label){var p=SSTCopy(recipes[0]);p.id=id;p.rootId=id;p.baseline=false;p.quick=false;
  p.recipeBlend={version:1,amount:.5,recipes:recipes.map(SSTCopy),weights:weights};p.scenario=label;
  delete p.pendingPreparation;delete p.finishRefinements;delete p.spatialHybrid;delete p.hdr;delete p.objectLift;delete p.objectTarget;delete p.endpoints;return p;}
 if(originals.length==2){g.push(blend("blendAB",originals,[.5,.5],"50% A + 50% B"));return g;}
 var A=originals[0],B=originals[1],C=originals[2];
 g.push(blend("blendAB",[A,B],[.5,.5],"50% A + 50% B"),blend("blendAC",[A,C],[.5,.5],"50% A + 50% C"),blend("blendBC",[B,C],[.5,.5],"50% B + 50% C"));
 g.push(blend("blendABC_A",[A,B,C],[.5,.25,.25],"50% A + 25% B + 25% C"),blend("blendABC_B",[A,B,C],[.25,.5,.25],"25% A + 50% B + 25% C"),blend("blendABC_C",[A,B,C],[.25,.25,.5],"25% A + 25% B + 50% C"));return g;
}
function SSTGridKey(s){return s.stage+":"+SSTOptional(s,"round",0)+":"+(s.branch||0)+":"+(s.refineStep||0);}

function SSTGrid(s){if(s.flow!==2)return SSTLegacyGrid(s);
 var key=SSTGridKey(s);if(s.replacementGrids&&s.replacementGrids[key])return s.replacementGrids[key];
 if(s.stage=="round")return s.candidates.slice(s.round*9,s.round*9+9);
 if(s.stage=="shortlist")return s.winners.slice();
 if(s.stage=="blend")return SSTFinalistBlendGrid(s.blendSources);
 if(s.stage=="refine")return s.refineGrid;
 if(s.stage=="playoff")return s.refinedWinners.slice();
 if(s.stage=="compare")return [s.userFavorite,s.autoPath.finalWinner];
 return [s.finalWinner];
}
function SSTInitial(s){s.stage="round";s.round=0;s.winners=[];s.choices=[];s.shortlist=[];s.branch=0;s.refineStep=0;s.refineGrid=[];s.refinedWinners=[];s.finalWinner=null;delete s.completed;delete s.explanation;delete s.winnerInfo;delete s.userFavorite;delete s.finalComparison;delete s.comparisonPreviews;delete s.blendSources;}
function SSTComplete(s,p,time){
 if(s.comparisonEnabled&&!s.automatic){s.userFavorite=SSTCopy(p);
  if(s.comparisonSkipIdentical&&s.autoPath&&s.autoPath.finalWinner&&SSTSameSettings(p,s.autoPath.finalWinner)){
   s.finalWinner=SSTCopy(p);s.stage="complete";s.completed=time;s.finalComparison={selected:"same",userRecipe:SSTCopy(p),trainerRecipe:SSTCopy(s.autoPath.finalWinner),time:time,note:"Both paths chose identical settings; comparison skipped."};return;}
  s.stage="compare";return;}
 s.finalWinner=SSTCopy(p);s.stage="complete";s.completed=time;
}
function SSTApplyEvent(s,e){var grid=SSTGrid(s),indices=e.indices;
 if(!e||e.stage!=s.stage||!indices||!(indices instanceof Array)||JSON.stringify(e.offered)!=JSON.stringify(grid.map(function(p){return p.id;})))throw new Error("Invalid tournament event.");
 var skipped=SSTOptional(e,"skipped",false);
 if(skipped){if(indices.length||["round","refine"].indexOf(s.stage)<0)throw new Error("Invalid skipped round.");indices=[0];}
 var expected=(s.stage=="shortlist"||s.stage=="blend")?3:1,seen={};if(indices.length<1||indices.length>expected)throw new Error("Choose one candidate, or 1-3 finalists.");
 for(var k=0;k<indices.length;k++){var i=indices[k];if(i%1||i<0||i>=grid.length||seen[i])throw new Error("Invalid selection.");seen[i]=true;}
 if(s.stage=="round"){if(!skipped)s.winners.push(SSTCopy(grid[indices[0]]));s.round++;if(s.round==9)s.stage="shortlist";}
 else if(s.stage=="shortlist"||s.stage=="blend"){
  var selection=indices.map(function(i){return SSTCopy(grid[i]);});
  if(s.stage=="shortlist"&&SSTOptional(s,"blendFinalists",false)&&selection.length>1){s.shortlist=selection;s.blendSources=selection.map(SSTCopy);s.stage="blend";}
  else{s.shortlist=selection;s.branch=0;s.refineStep=0;s.stage="refine";s.refineGrid=SSTRefineGrid(s,s.shortlist[0]);}
 }
 else if(s.stage=="refine"){var winner=grid[indices[0]];s.refineStep++;
  if(s.refineStep<3)s.refineGrid=SSTRefineGrid(s,winner);
  else{s.refinedWinners.push(SSTCopy(winner));s.branch++;s.refineStep=0;
   if(s.branch<s.shortlist.length)s.refineGrid=SSTRefineGrid(s,s.shortlist[s.branch]);
   else if(s.shortlist.length==1)SSTComplete(s,winner,e.time);else s.stage="playoff";
  }
 }else if(s.stage=="compare"){
  s.finalWinner=SSTCopy(grid[indices[0]]);s.stage="complete";s.completed=e.time;
  s.finalComparison={selected:indices[0]==0?"user":"trainer",userRecipe:SSTCopy(s.userFavorite),trainerRecipe:SSTCopy(s.autoPath.finalWinner),time:e.time,note:e.note};
 }else if(s.stage=="playoff")SSTComplete(s,grid[indices[0]],e.time);else throw new Error("Tournament is complete.");
 s.choices.push(SSTCopy(e));
}
function SSTChoose(s,index,note,indices){if(s.flow!==2){SSTLegacyChoose(s,index,note);return;}
 SSTApplyEvent(s,{stage:s.stage,indices:(s.stage=="shortlist"||s.stage=="blend")?indices:[index],offered:SSTGrid(s).map(function(p){return p.id;}),note:String(note||""),time:new Date().toISOString()});
}
function SSTSkip(s,note){
 if(s.flow!==2||["round","refine"].indexOf(s.stage)<0)throw new Error("Skipping is available in initial and refinement rounds.");
 SSTApplyEvent(s,{stage:s.stage,indices:[],offered:SSTGrid(s).map(function(p){return p.id;}),skipped:true,note:String(note||"None acceptable"),time:new Date().toISOString()});
}
function SSTReplay(s,events){SSTInitial(s);for(var i=0;i<events.length;i++)SSTApplyEvent(s,events[i]);return s;}

function SSTValidateRecipe(p,C,depth){
 depth=depth||0;if(depth>3)throw new Error("Recipe blend nesting limit exceeded.");
 var learned=SSTOptional(p,"referenceCurve",null);if(learned){
  if(C!=3||p.quick||learned.version!==1||!(learned.curves instanceof Array)||learned.curves.length!=3)throw new Error("Invalid paired reference curve.");
  for(var rc=0;rc<3;rc++){var nodes=learned.curves[rc];if(!(nodes instanceof Array)||nodes.length<2||nodes.length>256)throw new Error("Invalid reference nodes.");
   for(var ri=0;ri<nodes.length;ri++){var n=nodes[ri];if(!(n instanceof Array)||n.length!=2||!isFinite(n[0])||!isFinite(n[1])||n[0]<0||n[0]>1||n[1]<0||n[1]>1||ri&&(n[0]<=nodes[ri-1][0]||n[1]<nodes[ri-1][1]))throw new Error("Nonmonotonic reference curve.");}
   if(nodes[0][0]!=0||nodes[0][1]!=0||nodes[nodes.length-1][0]!=1||nodes[nodes.length-1][1]!=1)throw new Error("Invalid reference curve endpoints.");}}
 var blend=SSTOptional(p,"recipeBlend",null);
 if(blend){if(p.quick||blend.version!==1||blend.amount!==.5||!(blend.recipes instanceof Array)||blend.recipes.length<2||blend.recipes.length>3)throw new Error("Invalid recipe blend.");
  var weights=SSTOptional(blend,"weights",[.5,.5]),sum=0;if(!(weights instanceof Array)||weights.length!=blend.recipes.length)throw new Error("Invalid blend weights.");
  for(var bi=0;bi<blend.recipes.length;bi++){if(!isFinite(weights[bi])||weights[bi]<=0||weights[bi]>=1)throw new Error("Invalid blend weight.");sum+=weights[bi];SSTValidateRecipe(blend.recipes[bi],C,depth+1);}if(Math.abs(sum-1)>1e-12)throw new Error("Blend weights must sum to one.");}

 var hybrid=SSTOptional(p,"spatialHybrid",null);
 if(hybrid){var mask=hybrid.mask;
  if(p.quick||hybrid.version!==1||!mask||!isFinite(hybrid.radius)||hybrid.radius<.5||hybrid.radius>2||!isFinite(mask.cx)||mask.cx<0||mask.cx>1||!isFinite(mask.cy)||mask.cy<0||mask.cy>1||!isFinite(mask.xx)||!isFinite(mask.yy)||!isFinite(mask.xy)||mask.xx<=0||mask.yy<=0||mask.xx*mask.yy-mask.xy*mask.xy<=0)throw new Error("Invalid spatial core mask.");
  var checked=SSTCopy(p);delete checked.spatialHybrid;checked.hdr=hybrid.core;SSTValidateRecipe(checked,C,depth);
 }

 var guard=SSTOptional(p,"broadbandColorGuard",null);
 if(guard&&(C!=3||guard.version!==1||!isFinite(guard.low)||!isFinite(guard.high)||guard.low<0||guard.high<=guard.low||!isFinite(guard.backgroundStrength)||guard.backgroundStrength<0||guard.backgroundStrength>1||!isFinite(guard.redStrength)||guard.redStrength<0||guard.redStrength>1))throw new Error("Invalid broadband color restraint.");
 var pedestal=SSTOptional(p,"sourcePedestal",null);if(pedestal){if(C!=3||p.quick||p.family<3||!(pedestal instanceof Array)||pedestal.length!=C)throw new Error("Invalid SHO background calibration.");for(var pc=0;pc<C;pc++)if(!isFinite(pedestal[pc])||pedestal[pc]<0||pedestal[pc]>=1)throw new Error("Invalid SHO background sample.");}
 if(p.shoGamutShoulder!==undefined&&(typeof p.shoGamutShoulder!=="boolean"||p.shoGamutShoulder&&(C!=3||p.quick||p.family<3)))throw new Error("Invalid SHO highlight shoulder.");
 var gains=SSTOptional(p,"sourceGain",null);if(gains){if(!pedestal||!(gains instanceof Array)||gains.length!=C)throw new Error("Invalid SHO channel gains.");for(var gc=0;gc<C;gc++)if(typeof gains[gc]!="number"||!isFinite(gains[gc])||gains[gc]<.05||gains[gc]>20)throw new Error("Invalid SHO channel gain.");}
 var finalContrast=SSTOptional(p,"autoHighContrast",0);if(typeof finalContrast!="number"||!isFinite(finalContrast)||finalContrast<0||finalContrast>1)throw new Error("Invalid Auto High Contrast strength");
 if(p.shoRedLift!==undefined&&(typeof p.shoRedLift!=="number"||!isFinite(p.shoRedLift)||p.shoRedLift<0||p.shoRedLift>.16||C!=3||p.quick))throw new Error("Invalid SHO red lift.");
 if(p.luminanceGamut!==undefined&&(typeof p.luminanceGamut!=="boolean"||p.luminanceGamut&&(p.quick||p.family<3)))throw new Error("Invalid luminance gamut mapping.");
 if(p.highlightShoulder!==undefined&&(typeof p.highlightShoulder!=="number"||!isFinite(p.highlightShoulder)||p.highlightShoulder<.7||p.highlightShoulder>.95||p.quick))throw new Error("Invalid highlight shoulder.");
 if(p.stellarCalibration!==undefined&&typeof p.stellarCalibration!=="boolean")throw new Error("Invalid stellar calibration.");
 var steps=SSTOptional(p,"finishRefinements",[]);
 if(!(steps instanceof Array)||steps.length>4)throw new Error("Invalid finished refinement history.");
 for(var fi=0;fi<steps.length;fi++){var f=steps[fi];if(!f||f.mode%1||f.mode<0||f.mode>3||typeof f.strength!="number"||!isFinite(f.strength)||Math.abs(f.strength)>.75)throw new Error("Invalid finished refinement.");}

 var lift=SSTOptional(p,"objectLift",null),target=SSTOptional(p,"objectTarget",null),pending=SSTOptional(p,"pendingPreparation",false);
 if(typeof pending!="boolean"||target!==null&&(typeof target!="number"||!isFinite(target)||target<.4||target>.75))throw new Error("Invalid preparation settings.");
 if(lift&&(lift.version!==1||typeof lift.background!="number"||!isFinite(lift.background)||lift.background<0||lift.background>=1||typeof lift.midtone!="number"||!isFinite(lift.midtone)||lift.midtone<=0||lift.midtone>=1||p.quick))throw new Error("Invalid object brightness curve.");
 var e=SSTOptional(p,"endpoints",null);
 if(e&&(e.version!==1||typeof e.black!="number"||typeof e.white!="number"||!isFinite(e.black)||!isFinite(e.white)||e.black<0||e.white>1||e.white-e.black<.04||p.quick))throw new Error("Invalid endpoint finishing recipe.");
 if(!p||typeof p.id!="string"||p.id.length>128||p.family%1||p.family<0||p.family>8||p.variant%1||p.variant<0||p.variant>8||!(p.black instanceof Array)||!(p.shape instanceof Array)||["mtf","asinh","log","gamma"].indexOf(p.method)<0||!isFinite(p.target)||p.target<=0||p.target>=1||!isFinite(p.second)||p.second<0||p.second>1)throw new Error("Invalid recipe.");
 var n=p.family<3?C:1;if(p.black.length!=n||p.shape.length!=n)throw new Error("Recipe channel mismatch.");
 for(var c=0;c<n;c++)if(!isFinite(p.black[c])||p.black[c]<0||p.black[c]>=1||!isFinite(p.shape[c])||p.shape[c]<0||p.shape[c]>1e12)throw new Error("Invalid recipe values.");
 if(p.selectiveMidtone!==undefined&&(!isFinite(p.selectiveMidtone)||p.selectiveMidtone<=0||p.selectiveMidtone>=1||!isFinite(p.selectiveKnee)||p.selectiveKnee<=0||p.selectiveKnee>=1||!isFinite(p.selectiveCeiling)||p.selectiveCeiling<.7||p.selectiveCeiling>.98))throw new Error("Invalid selective highlight curve.");
 var h=SSTOptional(p,"hdr",null);
 if(h){if(h.version!==1&&h.version!==2)throw new Error("Invalid HDR recipe version.");
  if(h.version==2&&(typeof h.coreContrast!="number"||!isFinite(h.coreContrast)||h.coreContrast<0||h.coreContrast>.9||typeof h.saturation!="number"||!isFinite(h.saturation)||h.saturation<0||h.saturation>.35))throw new Error("Invalid HDR contrast or saturation.");
  var keys=["background","backgroundOutput","knee","kneeOutput","ceiling","lowShape","highShape"];
  for(var hi=0;hi<keys.length;hi++)if(typeof h[keys[hi]]!="number"||!isFinite(h[keys[hi]]))throw new Error("Invalid HDR anchor.");
  if(h.background<0||h.background>=h.knee||h.knee>=1||h.backgroundOutput<0||h.backgroundOutput>=h.kneeOutput||h.kneeOutput>=h.ceiling||h.ceiling>.98||h.lowShape<=0||h.lowShape>40||h.highShape<1||h.highShape>1e12||p.quick)throw new Error("Invalid HDR anchor range.");
 }
 if(p.hdrShape!==undefined&&(!isFinite(p.hdrShape)||p.hdrShape<0||p.hdrShape>1e12))throw new Error("Invalid HDR curve.");
 if(p.finishGamma!==undefined&&(typeof p.finishGamma!="number"||!isFinite(p.finishGamma)||p.finishGamma<.35||p.finishGamma>2.8))throw new Error("Invalid final brightness gamma.");
 if(p.quick&&(p.family!=0||p.linear!==true||typeof p.contrast!="number"||!isFinite(p.contrast)||p.contrast<0||p.contrast>1.5))throw new Error("Invalid Quick pipeline.");
}
// Image math may differ by a few last bits across JavaScript runtimes.
function SSTReplayEqual(a,b){
 if(a===b)return true;if(typeof a!=typeof b||a===null||b===null)return false;
 if(typeof a=="number")return isFinite(a)&&isFinite(b)&&Math.abs(a-b)<=1e-12*Math.max(1e-8,Math.abs(a),Math.abs(b));
 if(typeof a!="object")return false;
 var ka=Object.keys(a).filter(function(k){return a[k]!==undefined;}),kb=Object.keys(b).filter(function(k){return b[k]!==undefined;});
 if(ka.length!=kb.length)return false;for(var i=0;i<ka.length;i++){var k=ka[i];if(kb.indexOf(k)<0||!SSTReplayEqual(a[k],b[k]))return false;}return true;
}
function SSTValidateDataset(d){
 if(!d||d.schema!="smart-stretch-trainer-1"||!(d.sessions instanceof Array)||d.sessions.length>10000)throw new Error("Unsupported trainer dataset.");
 for(var i=0;i<d.sessions.length;i++){var s=d.sessions[i];
  if(s.linearInfo){SSTValidateDescriptor(s.linearInfo);if(s.linearInfo.width!=s.sourceWidth||s.linearInfo.height!=s.sourceHeight||!s.stats||s.linearInfo.channels!=s.stats.channels.length)throw new Error("Linear measurements do not match source geometry.");}
  if(s.winnerInfo){if(!s.winnerInfo.measurement||!s.finalWinner||s.winnerInfo.recipeId!=s.finalWinner.id||s.winnerInfo.sourceFingerprint!=s.fingerprint)throw new Error("Winner measurements do not match final recipe/source.");SSTValidateDescriptor(s.winnerInfo.measurement);if(!s.stats||s.winnerInfo.measurement.width!=s.stats.width||s.winnerInfo.measurement.height!=s.stats.height||s.winnerInfo.measurement.channels!=s.stats.channels.length)throw new Error("Winner measurements do not match working-preview geometry.");}
  SSTValidateComparisonPreviews(s);
  if(SSTOptional(s,"blendFinalists",false)!==false&&SSTOptional(s,"blendFinalists",false)!==true)throw new Error("Invalid finalist blend setting.");
  if(s.palette!==undefined&&SST_PALETTES.indexOf(s.palette)<0)throw new Error("Invalid saved palette.");
  if(s.dataLabels&&(SST_DATA_KINDS.indexOf(s.dataLabels.dataKind)<0||SST_STAR_KINDS.indexOf(s.dataLabels.starContent)<0))throw new Error("Invalid data labels.");
  if(s.flow!==2){SSTLegacyValidateDataset({schema:d.schema,sessions:[s]});continue;}
  if(SST_TARGETS.indexOf(s.target)<0||!s.stats||!s.stats.luminance||!(s.stats.channels instanceof Array)||[1,3].indexOf(s.stats.channels.length)<0||!(s.candidates instanceof Array)||s.candidates.length!=81||!(s.choices instanceof Array)||s.choices.length>22||!isFinite(s.seed)||s.seed%1||s.seed<0||s.seed>4294967295)throw new Error("Invalid refinement session.");
  SSTValidatePreferenceModel(SSTOptional(s,"preferenceModel",null),s.stats.channels.length);
  var measurements=[s.stats.luminance].concat(s.stats.channels);
  for(var k=0;k<measurements.length;k++){var m=measurements[k];if(!m||!isFinite(m.median)||m.median<0||m.median>1||!isFinite(m.sigma)||m.sigma<0||m.sigma>2||!isFinite(m.p90)||m.p90<0||m.p90>1)throw new Error("Invalid measurements.");}
  var ids={},baseline=0;for(k=0;k<81;k++){var p=s.candidates[k];SSTValidateRecipe(p,s.stats.channels.length);if(ids[p.id]||p.id!="f"+p.family+"v"+p.variant)throw new Error("Duplicate/invalid initial candidate.");ids[p.id]=true;if(p.quick)baseline++;}if(baseline!=1)throw new Error("Missing full Quick baseline.");
  if(s.refineAlgorithm!==undefined&&s.refineAlgorithm!==2&&s.refineAlgorithm!==3&&s.refineAlgorithm!==4&&s.refineAlgorithm!==5&&s.refineAlgorithm!==6)throw new Error("Unknown refinement algorithm.");
  if(s.refineWidths){for(var key in s.refineWidths)if(!/^[0-2]:[0-2]$/.test(key)||[0,1,2].indexOf(s.refineWidths[key])<0)throw new Error("Invalid refinement range.");}
  if(s.comparisonEnabled){if(!s.autoPath||s.autoPath.automatic!==true||s.autoPath.comparisonEnabled||s.autoPath.autoPath||(s.stage=="compare"||s.stage=="complete")&&s.autoPath.stage!="complete")throw new Error("Missing completed automatic path.");SSTValidateDataset({schema:d.schema,sessions:[s.autoPath]});}
  if(s.replacementGrids){for(var rk in s.replacementGrids){if(!/^(round|refine):[0-9]:[0-2]:[0-2]$/.test(rk))throw new Error("Invalid replacement grid position.");var rg=s.replacementGrids[rk];if(!(rg instanceof Array)||rg.length!=9)throw new Error("Invalid replacement grid.");for(var ri=0;ri<rg.length;ri++)SSTValidateRecipe(rg[ri],s.stats.channels.length);}}
  var replay=SSTCopy(s),events=SSTCopy(s.choices);SSTReplay(replay,events);
  var fields=["stage","round","winners","shortlist","branch","refineStep","refineGrid","refinedWinners","finalWinner","completed","userFavorite","finalComparison"];
  if(SSTOptional(s,"blendFinalists",false))fields.push("blendSources");
  for(k=0;k<fields.length;k++)if(!SSTReplayEqual(SSTOptional(s,fields[k],null),SSTOptional(replay,fields[k],null)))throw new Error("Inconsistent saved tournament: "+fields[k]);
 }
 return d;
}

function SSTPreviewSamplesForRecipe(source,p){var image=null;try{image=SSTProcess(source,p);return SSTPreviewSamples(image);}finally{if(image)image.free();}}
function SSTNewAutomaticPath(session){
 var a={flow:2,automatic:true,blendFinalists:SSTOptional(session,"blendFinalists",false),refineAlgorithm:session.refineAlgorithm||3,refineWidths:{},seed:session.seed,palette:SSTOptional(session,"palette","Broadband RGB"),stats:SSTCopy(session.stats),target:session.target,candidates:SSTCopy(session.candidates),id:session.id+"-automatic",version:SST_VERSION,started:new Date().toISOString(),ratings:[],preferenceModel:SSTCopy(SSTOptional(session,"preferenceModel",null))};SSTInitial(a);return a;
}
function SSTAutomaticStep(session,working,shortlistCount,progress){
 var a=SSTCopy(session.autoPath);if(a.stage=="complete")return a;
 if(a.stage!=session.stage)throw new Error("Automatic path is out of sync. Start a new session.");
 var source=SSTQualitySource(working),count=0;
 while(true){
  SSTPrepareGrid(a,working);
  var grid=SSTGrid(a),quality=[],samples=[],rank=[];
  for(var i=0;i<grid.length;i++){if(progress)progress(++count);var image=null;
   try{image=SSTProcess(working,grid[i]);quality.push(SSTQuality(image,source));samples.push(SSTPreviewSamples(image));}finally{if(image)image.free();}rank.push(i);}
  if(a.stage=="refine"){var key=a.branch+":"+a.refineStep,width=a.refineWidths[key]||0;
   if(SSTSimilarPairs(samples)>=4&&width<2&&(a.refineAlgorithm<4||a.refineAlgorithm==5)){a.refineWidths[key]=width+1;a.refineGrid=SSTRefineGrid(a,SSTRefineParent(a));continue;}}
  SSTApplyPreferences(SSTOptional(a,"preferenceModel",null),quality);
  rank.sort(function(x,y){return SSTQualityOrder(quality[x],quality[y])||x-y;});
  // Same number of branches keeps both paths in step. The selected recipes
  // and every refinement choice remain independent of the user's choices.
  var selected=(a.stage=="shortlist"||a.stage=="blend")?rank.slice(0,SSTClamp(shortlistCount||1,1,3)):[rank[0]];
  a.ratings.push({stage:a.stage,offered:grid.map(function(p){return p.id;}),quality:quality,selected:selected.slice()});
  SSTChoose(a,selected[0],"Automatic heuristic selection on user click",selected);return a;
 }
}
function SSTSameSettings(a,b){return !!a&&!!b&&!!a.shoGamutShoulder==!!b.shoGamutShoulder&&JSON.stringify(SSTOptional(a,"sourceGain",null))==JSON.stringify(SSTOptional(b,"sourceGain",null))&&JSON.stringify(SSTOptional(a,"sourcePedestal",null))==JSON.stringify(SSTOptional(b,"sourcePedestal",null))&&JSON.stringify(SSTOptional(a,"referenceCurve",null))==JSON.stringify(SSTOptional(b,"referenceCurve",null))&&SSTOptional(a,"autoHighContrast",0)==SSTOptional(b,"autoHighContrast",0)&&SSTOptional(a,"shoRedLift",0)==SSTOptional(b,"shoRedLift",0)&&!!a.luminanceGamut==!!b.luminanceGamut&&a.highlightShoulder==b.highlightShoulder&&!!a.stellarCalibration==!!b.stellarCalibration&&JSON.stringify(SSTOptional(a,"finishRefinements",[]))==JSON.stringify(SSTOptional(b,"finishRefinements",[]))&&JSON.stringify(SSTOptional(a,"objectLift",null))==JSON.stringify(SSTOptional(b,"objectLift",null))&&JSON.stringify(SSTOptional(a,"endpoints",null))==JSON.stringify(SSTOptional(b,"endpoints",null))&&JSON.stringify(SSTOptional(a,"hdr",null))==JSON.stringify(SSTOptional(b,"hdr",null))&&a.family==b.family&&a.method==b.method&&JSON.stringify(a.black)==JSON.stringify(b.black)&&JSON.stringify(a.shape)==JSON.stringify(b.shape)&&a.selectiveMidtone==b.selectiveMidtone&&a.selectiveKnee==b.selectiveKnee&&a.selectiveCeiling==b.selectiveCeiling&&a.hdrShape==b.hdrShape&&a.second==b.second&&!!a.quick==!!b.quick&&!!a.linear==!!b.linear&&(a.contrast||0)==(b.contrast||0)&&(a.finishGamma||1)==(b.finishGamma||1);}
function SSTRefineParent(s){var prefix="r"+s.branch+"s"+s.refineStep+"v";for(var i=0;i<s.refineGrid.length;i++)if(s.refineGrid[i].id.indexOf(prefix)!==0)return s.refineGrid[i];throw new Error("Missing refinement parent.");}
function SSTPreviewSamples(image){var a=[];for(var y=0;y<20;y++)for(var x=0;x<30;x++)for(var c=0;c<image.numberOfChannels;c++)a.push(image.sample(Math.min(image.width-1,Math.floor((x+.5)*image.width/30)),Math.min(image.height-1,Math.floor((y+.5)*image.height/20)),c));return a;}

function SSTSimilarPairs(samples){var n=0;for(var i=0;i<samples.length;i++)for(var j=0;j<i;j++)if(SSTRegionDifference(samples[i],samples[j],samples[i].length/600)<.008)n++;return n;}

function SSTGradientTools(image,view){
/* SmartGradientCorrection 0.1.17 — standalone PixInsight PJSR script.
 * Rename this .txt file to .js, then Script > Execute Script File.
 * Workflow: load a LINEAR floating-point mono/RGB main image; protect the
 * target; choose background reference; adjust live intensity; create output.
 * Background patches are measured automatically without sample-box editing.
 * v0.1.17: Separate Edit Gradient Map / Edit Protection Map brush modes.
 * Gradient painting explicitly includes missed fog in local measurements.
 * v0.1.14: Soft gradient Protect/Restore brushes and graded target overlay.
 * v0.1.13: Automatic irregular target mask with protect/restore brush edits.
 * No centered ellipse; disconnected and off-center targets are supported.
 * v0.1.12: Remove sample boxes/manual sample UI; automatic internal measurement.
 * Intensity builds cache on first use and directly repaints corrected preview.
 * v0.1.11: Live intensity preview reuses cached source pixels and correction map.
 * Build the map once; drag intensity; output uses that exact strength.
 * v0.1.10: Explicitly hide obsolete ring controls to prevent top-left overlap.
 * v0.1.9: Correction now uses the local linear background mesh and reference.
 * Overlay sensitivity never affects correction; mesh interpolates through targets.
 * v0.1.8: Fog overlay uses local linear patches and nearby-sample interpolation.
 * Target-excluded and poorly sampled areas stay unmarked; correction is unchanged.
 * v0.1.7: Select a linear background preview or image as fog-mask reference.
 * v0.1.6: Lower-reference, softer low-level fog overlay with sensitivity control.
 * v0.1.5: Toggle a source-linear fog severity overlay: blue/cyan/yellow/red.
 * Colors show fitted positive background excess, not correction strength.
 * v0.1.4: sampling exclusion is separate from optional pixel protection;
 * radial ring fit is opt-in. Save comparison JSON for diagnostic feedback.
 * Original image is never changed. Preview display stretch is never applied
 * to the output. Additive removes background excess; multiplicative corrects
 * relative illumination. A fit cannot identify true faint nebulosity by itself.
 * 0.1.1: Fix startup by avoiding the inherited numeric Control.width property.
 * Correction model = local background mesh; polynomial fits guide automatic sampling only.
 * Sampling exclusion omits target patches; optional pixel protection suppresses correction.
 */

var SRC_VERSION="0.1.17";
function SRCClamp(v,a,b){return Math.max(a,Math.min(b,v));}
function SRCQuantile(a,p){if(!a.length)return 0;a=a.slice().sort(function(x,y){return x-y;});var q=(a.length-1)*p,i=Math.floor(q);return a[i]*(1-q+i)+a[Math.min(i+1,a.length-1)]*(q-i);}
function SRCY(a){return a.length==1?a[0]:.2126*a[0]+.7152*a[1]+.0722*a[2];}
function SRCSmooth(t){t=SRCClamp(t,0,1);return t*t*(3-2*t);}
function SRCDefaults(){return {cx:.5,cy:.5,protect:true,protectPixels:false,protectWidth:.45,protectHeight:.45,feather:.15,ring:false,radius:.65,ringWidth:.18,targetMask:null,gradientMask:null,strength:.75,mode:0,linked:true};}
function SRCValidate(c){var keys=['cx','cy','protectWidth','protectHeight','feather','radius','ringWidth','strength'];for(var i=0;i<keys.length;i++)if(typeof c[keys[i]]!='number'||!isFinite(c[keys[i]]))throw new Error('Nonfinite correction setting.');if(c.cx<0||c.cx>1||c.cy<0||c.cy>1||c.protectWidth<.05||c.protectWidth>1||c.protectHeight<.05||c.protectHeight>1||c.feather<.01||c.feather>.5||c.radius<.05||c.radius>1.8||c.ringWidth<.03||c.ringWidth>.8||c.strength<0||c.strength>2.25||[0,1].indexOf(c.mode)<0)throw new Error('Correction setting out of range.');}
function SRCWeight(x,y,c){if(!c.protect||!c.targetMask)return 1;var m=c.targetMask;return 1-SRCClamp(SRCMeshValue(m.cells,m,x,y),0,1);}
function SRCAutoTargetMask(image){
 var W=64,H=SRCClamp(Math.round(W*image.height/image.width),24,80),cfg=SRCDefaults(),aspect=image.width/image.height,rows=[],values=[],raw=[],cells=[],thresholds=[],fits=[];
 cfg.protect=false;cfg.ring=false;
 for(var y=0;y<H;y++)for(var x=0;x<W;x++){var nx=(x+.5)/W,ny=(y+.5)/H;rows.push(SRCBasis(nx,ny,cfg,aspect));values.push(SRCPatch(image,nx,ny));}
 // Robust broad-field baseline is only a target-detection heuristic. Actual fog
 // correction remains the independent local background mesh.
 for(var c=0;c<image.numberOfChannels;c++){var a=values.map(function(v){return v[c];}),fit=SRCFitChannel(rows,a),residual=a.map(function(z,i){return z-SRCDot(rows[i],fit);}),med=SRCQuantile(residual,.5),mad=1.4826*SRCQuantile(residual.map(function(z){return Math.abs(z-med);}),.5),range=SRCQuantile(a,.98)-SRCQuantile(a,.1);fits.push(fit);thresholds.push(Math.max(1e-9,4*mad,.06*range));}
 for(var i=0;i<values.length;i++){var detected=false;for(c=0;c<fits.length;c++)if(Math.abs(values[i][c]-SRCDot(rows[i],fits[c]))>thresholds[c])detected=true;raw.push(detected?1:0);}
 // Remove isolated patch detections (stars are rejected separately), retain
 // disconnected extended objects, then add a small measurement safety margin.
 var visited=[],kept=[];for(i=0;i<raw.length;i++){visited[i]=false;kept[i]=0;cells[i]=0;}
 for(i=0;i<raw.length;i++)if(raw[i]&&!visited[i]){var queue=[i],component=[];visited[i]=true;for(var at=0;at<queue.length;at++){var k=queue[at],xx=k%W,yy=Math.floor(k/W);component.push(k);for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var px=xx+dx,py=yy+dy,n=py*W+px;if(px>=0&&px<W&&py>=0&&py<H&&raw[n]&&!visited[n]){visited[n]=true;queue.push(n);}}}if(component.length>=3)for(at=0;at<component.length;at++)kept[component[at]]=1;}
 for(y=0;y<H;y++)for(x=0;x<W;x++)if(kept[y*W+x])for(dy=-2;dy<=2;dy++)for(dx=-2;dx<=2;dx++){px=x+dx;py=y+dy;if(dx*dx+dy*dy<=4&&px>=0&&px<W&&py>=0&&py<H)cells[py*W+px]=1;}
 var count=0;for(i=0;i<cells.length;i++)count+=cells[i];return {width:W,height:H,cells:cells,protectedFraction:count/cells.length,method:'Robust per-channel residuals (bright and dark extended structure), connected components and 2-cell safety margin; heuristic, review with brush',thresholds:thresholds};
}
function SRCBrushTarget(mask,x,y,r,paint,aspect){
 for(var yy=0;yy<mask.height;yy++)for(var xx=0;xx<mask.width;xx++){var dx=((xx+.5)/mask.width-x)*aspect,dy=(yy+.5)/mask.height-y,d=Math.sqrt(dx*dx+dy*dy);if(d<=r){var amount=SRCSmooth((1-d/r)/.75),at=yy*mask.width+xx,old=SRCClamp(mask.cells[at],0,1);mask.cells[at]=paint?Math.max(old,amount):old*(1-amount);}}
 var n=0;for(var i=0;i<mask.cells.length;i++)n+=mask.cells[i];mask.protectedFraction=n/mask.cells.length;mask.brushMethod='Full center (inner 25% radius), smooth falloff to zero at edge; Protect=max, Restore=multiply complement';
}
function SRCManualBackground(points,cfg){
 var result=points.slice(),mask=cfg.gradientMask;if(!mask)return result;
 for(var y=0;y<mask.height;y++)for(var x=0;x<mask.width;x++){var amount=mask.cells[y*mask.width+x];if(amount<=.02)continue;var p={x:(x+.5)/mask.width,y:(y+.5)/mask.height,manual:amount},at=-1;
  for(var i=0;i<result.length;i++)if(Math.abs(result[i].x-p.x)<.003&&Math.abs(result[i].y-p.y)<.003){at=i;break;}
  if(at>=0)result[at].manual=Math.max(result[at].manual||0,amount);else result.push(p);
 }return result;
}
function SRCBasis(x,y,c,aspect){var u=(x-c.cx)*2*aspect,v=(y-c.cy)*2,r=Math.sqrt(u*u+v*v),a=[1,u,v,u*u,u*v,v*v];if(c.ring)a.push(Math.exp(-.5*Math.pow((r-c.radius)/c.ringWidth,2)));return a;}
function SRCDot(a,b){var s=0;for(var i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function SRCSolve(A,b){var n=b.length,m=[],i,j,k;for(i=0;i<n;i++)m.push(A[i].slice().concat([b[i]]));for(i=0;i<n;i++){var p=i;for(j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[p][i]))p=j;if(Math.abs(m[p][i])<1e-12)throw new Error('Sample geometry cannot constrain this model. Add background samples around the field or disable the ring term.');var tmp=m[i];m[i]=m[p];m[p]=tmp;var d=m[i][i];for(k=i;k<=n;k++)m[i][k]/=d;for(j=0;j<n;j++)if(j!=i){var q=m[j][i];for(k=i;k<=n;k++)m[j][k]-=q*m[i][k];}}var out=[];for(i=0;i<n;i++)out.push(m[i][n]);return out;}
function SRCFitChannel(rows,values){var n=rows[0].length,weights=[],fit=[],i,j,k;for(i=0;i<rows.length;i++)weights.push(1);for(var pass=0;pass<5;pass++){var A=[],b=[];for(j=0;j<n;j++){A[j]=[];b[j]=0;for(k=0;k<n;k++)A[j][k]=0;}for(i=0;i<rows.length;i++)for(j=0;j<n;j++){b[j]+=weights[i]*rows[i][j]*values[i];for(k=0;k<n;k++)A[j][k]+=weights[i]*rows[i][j]*rows[i][k];}fit=SRCSolve(A,b);var residual=[],abs=[];for(i=0;i<rows.length;i++)residual.push(values[i]-SRCDot(rows[i],fit));var center=SRCQuantile(residual,.5);for(i=0;i<residual.length;i++)abs.push(Math.abs(residual[i]-center));var sigma=Math.max(1e-10,1.4826*SRCQuantile(abs,.5));for(i=0;i<rows.length;i++){var z=Math.abs(residual[i]-center)/(2.5*sigma);weights[i]=z<=1?1:1/z;}}return fit;}
function SRCPatch(image,x,y){var C=image.numberOfChannels,planes=[],W=image.width,H=image.height,px=Math.round(x*(W-1)),py=Math.round(y*(H-1)),r=Math.max(2,Math.round(Math.min(W,H)*.012));for(var c=0;c<C;c++)planes[c]=[];for(var yy=Math.max(0,py-r);yy<=Math.min(H-1,py+r);yy++)for(var xx=Math.max(0,px-r);xx<=Math.min(W-1,px+r);xx++)for(c=0;c<C;c++){var v=image.sample(xx,yy,c);if(!isFinite(v))throw new Error('Nonfinite image sample.');planes[c].push(v);}var values=[];for(c=0;c<C;c++)values.push(SRCQuantile(planes[c],.35));return values;}
function SRCBuild(image,points,c){SRCValidate(c);var rows=[],values=[],kept=[],C=image.numberOfChannels,aspect=image.width/image.height;for(var i=0;i<points.length;i++){var p=points[i];if(SRCWeight(p.x,p.y,c)<.999&&!(p.manual>.02))continue;rows.push(SRCBasis(p.x,p.y,c,aspect));values.push(SRCPatch(image,p.x,p.y));kept.push(p);}if(rows.length<(c.ring?16:14))throw new Error('Use at least '+(c.ring?16:14)+' background samples outside the target mask.');var coefficients=[],anchors=[],residuals=[];for(var channel=0;channel<(c.linked?1:C);channel++){var v=[];for(i=0;i<values.length;i++)v.push(c.linked?SRCY(values[i]):values[i][channel]);var f=SRCFitChannel(rows,v),res=[];for(i=0;i<v.length;i++)res.push(v[i]-SRCDot(rows[i],f));coefficients.push(f);anchors.push(SRCQuantile(v,.2));residuals.push(SRCQuantile(res.map(function(a){return Math.abs(a);}),.5));}if(c.mode==1)for(channel=0;channel<anchors.length;channel++)if(anchors[channel]<=1e-8)throw new Error('Multiplicative correction needs a positive background. Use additive for near-zero/starless backgrounds.');return {version:1,config:JSON.parse(JSON.stringify(c)),aspect:aspect,coefficients:coefficients,anchors:anchors,residuals:residuals,sampleCount:rows.length};}
function SRCMeshValue(plane,grid,x,y){
 var px=SRCClamp(x*grid.width-.5,0,grid.width-1),py=SRCClamp(y*grid.height-.5,0,grid.height-1),ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(ix+1,grid.width-1),jy=Math.min(iy+1,grid.height-1),fx=px-ix,fy=py-iy;
 return (1-fy)*((1-fx)*plane[iy*grid.width+ix]+fx*plane[iy*grid.width+jx])+fy*((1-fx)*plane[jy*grid.width+ix]+fx*plane[jy*grid.width+jx]);
}
function SRCLocalCorrection(local,cfg,reference){
 SRCValidate(cfg);var anchors=[],planes=cfg.linked?[local.levels.slice()]:local.planes.map(function(p){return p.slice();});
 for(var c=0;c<planes.length;c++){var supported=[];for(var i=0;i<planes[c].length;i++)if(local.confidence[i]>.2)supported.push(planes[c][i]);anchors.push(reference?(cfg.linked?reference.luminanceLevel:reference.levels[c]):SRCQuantile(supported,.02));}
 if(cfg.mode==1)for(c=0;c<anchors.length;c++){if(anchors[c]<=1e-8)throw new Error('Multiplicative correction needs a positive background reference. Use additive mode.');for(i=0;i<planes[c].length;i++)if(planes[c][i]<=0)throw new Error('Local background mesh crosses zero. Use additive mode.');}
 return {version:2,type:'localBackgroundMesh',config:JSON.parse(JSON.stringify(cfg)),grid:{width:local.width,height:local.height,planes:planes},anchors:anchors,sampleCount:local.samples.length,backgroundReference:reference?JSON.parse(JSON.stringify(reference)):null,method:local.method+' Bilinear mesh correction; interpolate through excluded target; positive excess only.'};
}
function SRCValue(v,x,y,m){
 for(var vi=0;vi<v.length;vi++)if(!isFinite(v[vi]))throw new Error('Nonfinite source pixel.');var c=m.config,w=(c.protectPixels===false?1:SRCWeight(x,y,c))*c.strength;if(w<=0)return v.slice();var out=[];
 for(var i=0;i<v.length;i++){var index=c.linked?0:i,model=SRCMeshValue(m.grid.planes[index],m.grid,x,y),anchor=m.anchors[index],z;if(!isFinite(model))throw new Error('Nonfinite local background.');if(c.mode==0)z=v[i]-w*Math.max(0,model-anchor);else{if(model<=0)throw new Error('Local illumination background crosses zero.');var factor=SRCClamp(anchor/model,.5,1);z=v[i]*SRCClamp(1+w*(factor-1),.05,1);}if(!isFinite(z))throw new Error('Nonfinite corrected pixel.');out.push(z);}return out;
}
function SRCSuggest(image,c){
 var candidates=[],levels=[],aspect=image.width/image.height;
 for(var y=0;y<18;y++)for(var x=0;x<24;x++){var p={x:(x+.5)/24,y:(y+.5)/18};if(SRCWeight(p.x,p.y,c)<.999)continue;p.values=SRCPatch(image,p.x,p.y);p.level=SRCY(p.values);candidates.push(p);levels.push(p.level);}
 if(candidates.length<20)throw new Error('Too little unprotected background for suggestions. Reduce protection only if that exposes genuine background.');
 var bright=SRCQuantile(levels,.88),pool=candidates.filter(function(p){return p.level<=bright;}),rejected=[];
 for(var pass=0;pass<3;pass++){if(pool.length<20)break;var rows=pool.map(function(p){return SRCBasis(p.x,p.y,c,aspect);}),fits=[],scales=[];
  for(var ch=0;ch<image.numberOfChannels;ch++){var v=pool.map(function(p){return p.values[ch];}),f=SRCFitChannel(rows,v),r=v.map(function(z,i){return z-SRCDot(rows[i],f);});fits.push(f);var center=SRCQuantile(r,.5);scales.push(Math.max(1e-9,1.4826*SRCQuantile(r.map(function(z){return Math.abs(z-center);}),.5)));}
  var next=[];for(var i=0;i<pool.length;i++){var p=pool[i],row=SRCBasis(p.x,p.y,c,aspect),suspect=false;
   for(ch=0;ch<fits.length;ch++)if(p.values[ch]-SRCDot(row,fits[ch])>3*scales[ch])suspect=true;
   // Local high-percentile excess identifies stars/knots that patch quantiles
   // can miss. Smooth low-frequency ring backgrounds remain candidates.
   var px=Math.round(p.x*(image.width-1)),py=Math.round(p.y*(image.height-1)),local=[];
   for(var dy=-3;dy<=3;dy++)for(var dx=-3;dx<=3;dx++){var xx=SRCClamp(px+dx,0,image.width-1),yy=SRCClamp(py+dy,0,image.height-1),v=[];for(ch=0;ch<image.numberOfChannels;ch++)v.push(image.sample(xx,yy,ch));local.push(SRCY(v));}
   if(SRCQuantile(local,.95)-SRCQuantile(local,.35)>Math.max(8*SRCQuantile(scales,.5),.5*Math.max(1e-8,p.level)))suspect=true;
   if(suspect)rejected.push({x:p.x,y:p.y});else next.push(p);
  }if(next.length==pool.length)break;pool=next;
 }
 for(var i=0;i<candidates.length;i++)if(candidates[i].level>bright)rejected.push({x:candidates[i].x,y:candidates[i].y});
 var points=SRCManualBackground(pool.map(function(p){return {x:p.x,y:p.y};}),c);SRCBuild(image,points,c);return {points:points,rejected:rejected,considered:candidates.length};
}
function SRCApply(image,model,progress,cancelled){
 var out=new Image(image),W=image.width,H=image.height,C=image.numberOfChannels,total=W*H;
 try{for(var y0=0;y0<H;y0+=8){var y1=Math.min(H,y0+8),rect=new Rect(0,y0,W,y1),planes=[];for(var c=0;c<C;c++){var a=[];image.getSamples(a,rect,c);planes.push(a);}
  for(var i=0;i<W*(y1-y0);i++){if(i%2048==0){if(progress)progress((y0*W+i)/total);if(cancelled&&cancelled())throw new Error('Correction cancelled. No output image created.');}var x=i%W,y=y0+Math.floor(i/W),v=[];for(c=0;c<C;c++)v.push(planes[c][i]);var z=SRCValue(v,x/Math.max(1,W-1),y/Math.max(1,H-1),model);for(c=0;c<C;c++)planes[c][i]=z[c];}
  for(c=0;c<C;c++)out.setSamples(planes[c],rect,c);
 }if(progress)progress(1);return out;}catch(e){out.free();throw e;}
}
function SRCPreviewCache(image,model){
 var W=image.width,H=image.height,C=image.numberOfChannels,rect=new Rect(0,0,W,H),source=[],delta=[],maxDelta=0;
 for(var c=0;c<C;c++){source[c]=[];image.getSamples(source[c],rect,c);delta[c]=[];}
 for(var y=0;y<H;y++)for(var x=0;x<W;x++){var nx=x/Math.max(1,W-1),ny=y/Math.max(1,H-1),protection=model.config.protectPixels===false?1:SRCWeight(nx,ny,model.config),at=y*W+x;
  for(c=0;c<C;c++){var index=model.config.linked?0:c,bg=SRCMeshValue(model.grid.planes[index],model.grid,nx,ny),anchor=model.anchors[index];delta[c][at]=protection*(model.config.mode==0?Math.max(0,bg-anchor):SRCClamp(anchor/bg,.5,1)-1);maxDelta=Math.max(maxDelta,Math.abs(delta[c][at]));}
 }
 return {width:W,height:H,source:source,delta:delta,mode:model.config.mode,maxDelta:maxDelta,rect:rect,image:new Image(image)};
}
function SRCLivePreview(cache,strength,display){
 for(var c=0;c<cache.source.length;c++){var a=cache.source[c].slice(),d=cache.delta[c];for(var i=0;i<a.length;i++){var z=cache.mode==0?a[i]-strength*d[i]:a[i]*SRCClamp(1+strength*d[i],.05,1);if(display){z=SRCClamp((z-display.black)/(1-display.black),0,1);z=z<=0?0:z>=1?1:(1-display.mid)*z/(display.mid+(1-2*display.mid)*z);}a[i]=z;}cache.image.setSamples(a,cache.rect,c);}
 return cache.image.render();
}
function SRCStrengthModels(model){var list=[];for(var i=0;i<9;i++){var m=JSON.parse(JSON.stringify(model));m.config.strength=(i+1)*.25;SRCValidate(m.config);list.push(m);}return list;}
function SRCMeasure(image,points,cfg){
 var channels=[],background=[],step=Math.max(1,Math.ceil(Math.sqrt(image.width*image.height/12000))),n=0;
 for(var c=0;c<image.numberOfChannels;c++){channels[c]=[];background[c]=[];}
 for(var y=0;y<image.height;y+=step)for(var x=0;x<image.width;x+=step){n++;for(c=0;c<channels.length;c++)channels[c].push(image.sample(x,y,c));}
 for(var i=0;i<points.length;i++)if(SRCWeight(points[i].x,points[i].y,cfg)>=.999){var v=SRCPatch(image,points[i].x,points[i].y);for(c=0;c<channels.length;c++)background[c].push(v[c]);}
 var stats=[];for(c=0;c<channels.length;c++){var a=channels[c],b=background[c],below=0,above=0;for(i=0;i<a.length;i++){if(!isFinite(a[i]))throw new Error('Nonfinite diagnostic sample.');if(a[i]<0)below++;if(a[i]>1)above++;}stats.push({channel:c,min:SRCQuantile(a,0),p01:SRCQuantile(a,.01),median:SRCQuantile(a,.5),p99:SRCQuantile(a,.99),max:SRCQuantile(a,1),negativeFraction:below/a.length,aboveOneFraction:above/a.length,backgroundPatchCount:b.length,backgroundP10:b.length?SRCQuantile(b,.1):null,backgroundMedian:b.length?SRCQuantile(b,.5):null,backgroundP90:b.length?SRCQuantile(b,.9):null});}
 return {method:'Regular subsample of working preview; background patches at accepted sample positions',sampledPixelCount:n,step:step,channels:stats};
}
function SRCRecord(image,points,rejected,models,source,display){return {schemaVersion:1,tool:'SmartGradientCorrection',toolVersion:SRC_VERSION,createdUTC:new Date().toISOString(),source:JSON.parse(JSON.stringify(source)),preview:{width:image.width,height:image.height,channels:image.numberOfChannels},coordinates:'Sample positions normalized to [0,1] across source frame',display:JSON.parse(JSON.stringify(display)),samples:points.map(function(p){return {x:p.x,y:p.y,values:SRCPatch(image,p.x,p.y)};}),rejectedSuggestions:JSON.parse(JSON.stringify(rejected)),sourceMeasurements:SRCMeasure(image,points,models[0].config),candidates:models.map(function(m,i){return {number:i+1,strengthPercent:m.config.strength*100,model:JSON.parse(JSON.stringify(m)),measurements:null};}),selectedCandidate:null,outputViewId:null};}
// Fog diagnostics use local source patches, independently of correction fits.
function SRCLocalFog(image,points,cfg){
 var samples=[],noises=[],aspect=image.width/image.height;
 for(var i=0;i<points.length;i++){var p=points[i];if(SRCWeight(p.x,p.y,cfg)<.999&&!(p.manual>.02))continue;var values=SRCPatch(image,p.x,p.y),value=SRCY(values),px=Math.round(p.x*(image.width-1)),py=Math.round(p.y*(image.height-1)),a=[];
  for(var dy=-3;dy<=3;dy++)for(var dx=-3;dx<=3;dx++){var v=[];for(var c=0;c<image.numberOfChannels;c++)v.push(image.sample(SRCClamp(px+dx,0,image.width-1),SRCClamp(py+dy,0,image.height-1),c));a.push(SRCY(v));}
  var med=SRCQuantile(a,.5);noises.push(1.4826*SRCQuantile(a.map(function(z){return Math.abs(z-med);}),.5));samples.push({x:p.x,y:p.y,level:value,values:values,manual:p.manual||0});
 }
 if(samples.length<8)throw new Error('Fog mapping needs at least 8 reviewed background samples outside the target.');
 var W=80,H=SRCClamp(Math.round(W/aspect),24,96),levels=[],confidence=[],field=[],planes=[];for(var channel=0;channel<image.numberOfChannels;channel++)planes[channel]=[];
 for(var y=0;y<H;y++)for(var x=0;x<W;x++){var nx=(x+.5)/W,ny=(y+.5)/H,nearest=[];
  for(i=0;i<samples.length;i++){var q=samples[i],d=Math.pow((q.x-nx)*aspect,2)+Math.pow(q.y-ny,2),at=0;while(at<nearest.length&&nearest[at].d<d)at++;if(at<12){nearest.splice(at,0,{d:d,level:q.level,values:q.values,manual:q.manual||0});if(nearest.length>12)nearest.pop();}}
  var sum=0,weight=0;for(i=0;i<nearest.length;i++){var w=(1+4*nearest[i].manual)/Math.pow(nearest[i].d+.0009,2);sum+=w*nearest[i].level;weight+=w;}
  for(channel=0;channel<planes.length;channel++){var channelSum=0;for(i=0;i<nearest.length;i++)channelSum+=nearest[i].values[channel]*(1+4*nearest[i].manual)/Math.pow(nearest[i].d+.0009,2);planes[channel].push(channelSum/weight);}
  var manualSupport=cfg.gradientMask?SRCMeshValue(cfg.gradientMask.cells,cfg.gradientMask,nx,ny):0;var support=Math.max(SRCWeight(nx,ny,cfg),manualSupport)*SRCSmooth((.22-Math.sqrt(nearest[0].d))/.12),level=sum/weight;levels.push(level);confidence.push(support);if(support>.2)field.push(level);
 }
 if(!field.length)throw new Error('No supported background area for fog mapping. Review sample coverage.');
 return {width:W,height:H,levels:levels,planes:planes,confidence:confidence,field:field,noise:SRCQuantile(noises,.5),samples:samples,config:JSON.parse(JSON.stringify(cfg)),method:'Local source-linear 35th-percentile patches; user-painted background regions bypass automatic rejection and receive soft-weighted priority; 12 nearby samples with distance weighting; target exclusion and distance-based support. No polynomial or radial fit in overlay.'};
}
function SRCBackgroundReference(view,channels){
 if(!view||view.isNull)throw new Error('Background reference is no longer available. Refresh the reference list.');
 var im=view.image;if(im.sampleType!=SampleType_Real||im.numberOfChannels!=channels)throw new Error('Background reference must be floating-point linear data with the same channel count as the loaded source.');
 var step=Math.max(1,Math.ceil(Math.sqrt(im.width*im.height/16000))),planes=[],luminance=[],count=0;
 for(var c=0;c<channels;c++)planes[c]=[];
 for(var y=0;y<im.height;y+=step)for(var x=0;x<im.width;x+=step){var v=[];for(c=0;c<channels;c++){var z=im.sample(x,y,c);if(!isFinite(z))throw new Error('Nonfinite background reference pixel.');planes[c].push(z);v.push(z);}luminance.push(SRCY(v));count++;}
 if(count<16)throw new Error('Background reference is too small; use at least 16 pixels.');
 var levels=[],noise=[];for(c=0;c<channels;c++){var med=SRCQuantile(planes[c],.5);levels.push(med);noise.push(1.4826*SRCQuantile(planes[c].map(function(z){return Math.abs(z-med);}),.5));}
 var lm=SRCQuantile(luminance,.5),ln=1.4826*SRCQuantile(luminance.map(function(z){return Math.abs(z-lm);}),.5);
 return {viewId:view.fullId,width:im.width,height:im.height,channels:channels,sampledPixelCount:count,levels:levels,noise:noise,luminanceLevel:SRCY(levels),luminanceNoise:ln,method:'Median linear channel levels and luminance MAD from selected background view'};
}
function SRCFogMap(local,sensitivity,backgroundReference){
 sensitivity=SRCClamp(typeof sensitivity=='number'?sensitivity:2,.5,8);
 var reference=backgroundReference?backgroundReference.luminanceLevel:SRCQuantile(local.field,.02),noise=backgroundReference?backgroundReference.luminanceNoise:local.noise,floor=Math.max(1e-10,.5*noise/sensitivity),peak=Math.max(0,SRCQuantile(local.field,.98)-reference),span=Math.max(1e-10,peak-floor),cells=[];
 for(var i=0;i<local.levels.length;i++){var excess=Math.max(0,local.levels[i]-reference-floor);cells.push(peak>floor?Math.pow(SRCClamp(excess/span,0,1),1/sensitivity)*local.confidence[i]:0);}
 return {width:local.width,height:local.height,cells:cells,noiseFloor:floor,reference:reference,sensitivity:sensitivity,highExcess:peak,sampleCount:local.samples.length,backgroundReference:backgroundReference?JSON.parse(JSON.stringify(backgroundReference)):null,method:local.method+' Reference: '+(backgroundReference?'selected linear background median':'local field p02')};
}
function SRCFogColor(t){var stops=[[35,90,255],[0,220,255],[255,230,0],[255,35,20]],q=SRCClamp(t,0,1)*3,i=Math.min(2,Math.floor(q)),f=q-i,a=stops[i],b=stops[i+1],alpha=Math.round(160*SRCSmooth(Math.min(1,t*6))),r=Math.round(a[0]+f*(b[0]-a[0])),g=Math.round(a[1]+f*(b[1]-a[1])),bl=Math.round(a[2]+f*(b[2]-a[2]));return ((alpha<<24)|(r<<16)|(g<<8)|bl)>>>0;}
// END PURE ENGINE
function SRCError(e){new MessageBox(String(e),'SmartGradientCorrection',StdIcon_Error,StdButton_Ok).execute();}
function SRCDisplay(image,settings){var out=new Image(image),C=out.numberOfChannels;for(var y=0;y<out.height;y++)for(var x=0;x<out.width;x++)for(var c=0;c<C;c++){var z=SRCClamp((out.sample(x,y,c)-settings.black)/(1-settings.black),0,1);z=z<=0?0:z>=1?1:(1-settings.mid)*z/(settings.mid+(1-2*settings.mid)*z);out.setSample(z,x,y,c);}var b=out.render();out.free();return b;}
function SRCDisplaySettings(image){var a=[],step=Math.max(1,Math.ceil(Math.sqrt(image.width*image.height/12000)));for(var y=0;y<image.height;y+=step)for(var x=0;x<image.width;x+=step){var v=[];for(var c=0;c<image.numberOfChannels;c++)v.push(image.sample(x,y,c));a.push(SRCY(v));}var black=Math.max(0,SRCQuantile(a,.01)),median=Math.max(1e-8,(SRCQuantile(a,.5)-black)/(1-black)),target=.22,mid=median*(target-1)/(2*target*median-target-median);return {black:black,mid:SRCClamp(mid,1e-8,1-1e-8)};}
function SRCCanvas(parent){var c=new Control(parent);STScreenFit.preview(c,560,390);c.bitmap=null;c.points=[];c.config=null;c.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(0xff151515));if(!this.bitmap)return;var scale=Math.min(this.width/this.bitmap.width,this.height/this.bitmap.height),w=this.bitmap.width*scale,h=this.bitmap.height*scale,ox=(this.width-w)/2,oy=(this.height-h)/2;g.scaleTransformation(scale);g.drawBitmap(Math.round(ox/scale),Math.round(oy/scale),this.bitmap);g.end();g=new Graphics(this);if(this.fog){var fog=this.fog;for(var fy=0;fy<fog.height;fy++)for(var fx=0;fx<fog.width;fx++){var t=fog.cells[fy*fog.width+fx];if(t>.001)g.fillRect(ox+fx*w/fog.width,oy+fy*h/fog.height,ox+(fx+1)*w/fog.width,oy+(fy+1)*h/fog.height,new Brush(SRCFogColor(t)));}} if(this.showGradientEdits&&this.config&&this.config.gradientMask){var edits=this.config.gradientMask;for(var ey=0;ey<edits.height;ey++)for(var ex=0;ex<edits.width;ex++){var ev=edits.cells[ey*edits.width+ex];if(ev>.001)g.fillRect(ox+ex*w/edits.width,oy+ey*h/edits.height,ox+(ex+1)*w/edits.width,oy+(ey+1)*h/edits.height,new Brush(((Math.round(85*ev)<<24)|0x0000ffaa)>>>0));}}
 if(this.showTarget&&this.config&&this.config.protect&&this.config.targetMask){var mask=this.config.targetMask;for(var my=0;my<mask.height;my++)for(var mx=0;mx<mask.width;mx++)if(mask.cells[my*mask.width+mx]>.001)g.fillRect(ox+mx*w/mask.width,oy+my*h/mask.height,ox+(mx+1)*w/mask.width,oy+(my+1)*h/mask.height,new Brush(((Math.round(102*mask.cells[my*mask.width+mx])<<24)|0x00ffdd33)>>>0));}}finally{g.end();}};return c;}
function SRCDialog(){this.__base__=Dialog;this.__base__();var self=this;this.windowTitle='SmartGradientCorrection '+SRC_VERSION;this.cfg=SRCDefaults();this.points=[];this.work=null;this.snapshot=null;this.model=null;this.busy=false;this.cancelRequested=false;this.rejected=[];this.display=null;this.originalBitmap=null;this.correctedBitmap=null;this.records=[];this.activeRecord=null;this.sourceInfo=null;this.fogMap=null;this.fogModel=null;this.backgroundReference=null;this.referenceViews=[];this.previewCache=null;this.previewPending=false;
 this.views=STHoverAttach(new ViewList(this),"Choose an open source image to analyze or process.");this.views.getMainViews();if(!ImageWindow.activeWindow.isNull)this.views.currentView=ImageWindow.activeWindow.mainView;
 this.backgroundList=STHoverAttach(new ComboBox(this),"Choose a clean background reference in the same linear brightness scale as the source.");this.backgroundList.toolTip='Choose the FindBackground preview tab or a separate clean-sky image. Reference and source must be linear and in the same calibration/brightness scale. STF display stretch is fine; a permanently stretched image is unsuitable. Reference supplies both fog overlay and correction baseline. Changing it requires building the map again.';
 this.backgroundNote=new Label(this);this.backgroundNote.text='Background reference: automatic estimate';
 this.status=new Label(this);this.status.text='Load a linear mono/RGB image. Preview stretch is display-only.';
 this.canvas=SRCCanvas(this);this.canvas.toolTip='Edit Protection Map paints yellow target protection. Edit Gradient Map paints green background-inclusion strokes and updates the fog map after release. Intensity shows the corrected image.';
 this.mode=STHoverAttach(new ComboBox(this),"Additive removes excess background glow; Multiplicative corrects uneven illumination.");this.mode.addItem('Additive — excess background glow');this.mode.addItem('Multiplicative — uneven illumination');
 this.linked=new CheckBox(this);this.linked.text=STHoverCaption(this.linked,'Linked RGB correction',0);this.linked.checked=true;
 this.protect=new CheckBox(this);this.protect.text=STHoverCaption(this.protect,'Exclude target from background measurement',0);this.protect.checked=true;
 this.protectPixels=new CheckBox(this);this.protectPixels.text=STHoverCaption(this.protectPixels,'Also leave target pixels uncorrected',0);this.protectPixels.checked=false;this.protectPixels.toolTip='Off: interpolate and correct background beneath the target too. On: leave masked target pixels uncorrected.';
 this.before=new CheckBox(this);this.before.text=STHoverCaption(this.before,'Show original (same display stretch)',0);this.before.checked=true;
 this.autoStretch=new CheckBox(this);this.autoStretch.text=STHoverCaption(this.autoStretch,'Display stretch',0);this.autoStretch.checked=true;
 this.showFog=new CheckBox(this);this.showFog.text=STHoverCaption(this.showFog,'Show estimated fog/cloud mask',0);this.showFog.checked=false;this.showFog.toolTip='Local measurements in the linear source, independent of the correction fit. Uses automatically selected background patches. Target-excluded and poorly supported regions remain unmarked; unmarked does not necessarily mean fog-free.';
 this.fogLegend=new Label(this);this.fogLegend.text='Fog mask: transparent = low; blue > cyan > yellow > red = increasing excess.';this.fogLegend.toolTip='Colors are relative within this source image, not an absolute fog measurement. Real faint nebulosity can be mistaken for background.';
 this.fogSensitivity=new NumericControl(this);this.fogSensitivity.label.text=STHoverCaption(this.fogSensitivity,'Fog mask sensitivity',2);this.fogSensitivity.setRange(.5,8);this.fogSensitivity.setPrecision(2);this.fogSensitivity.slider.setRange(0,150);this.fogSensitivity.setValue(2);this.fogSensitivity.toolTip=STHoverNumericText(this.fogSensitivity,'Higher reveals weaker estimated glow. Changes the overlay only. Uniform glow needs a reliable external reference. Detail smaller than the background sample spacing is not resolved.',2);
 this.mapMode=STHoverAttach(new ComboBox(this),"Choose whether brush edits modify the background measurement map or the target-protection map.");this.mapMode.addItem('Edit Gradient Map');this.mapMode.addItem('Edit Protection Map');this.mapMode.currentItem=1;this.mapMode.toolTip='Gradient Map: include painted regions as background measurements even if automatic detection rejected them. Protection Map: paint/restore astronomical target protection. Both use soft brushes.';
 this.showTarget=new CheckBox(this);this.showTarget.text=STHoverCaption(this.showTarget,'Show target protection mask (yellow)',0);this.showTarget.checked=true;
 this.brushMode=STHoverAttach(new ComboBox(this),"Choose viewing only, painting protection, or erasing protection from the editable map.");this.brushMode.addItem('View — no painting');this.brushMode.addItem('Protect target — paint');this.brushMode.addItem('Restore background — erase');this.brushSize=STHoverAttach(new ComboBox(this),"Choose the size of the soft brush used to edit the gradient or target-protection map.");this.brushSize.addItem('Small brush');this.brushSize.addItem('Medium brush');this.brushSize.addItem('Large brush');this.brushSize.currentItem=1;this.brushSize.toolTip='Soft gradient brush: full strength in the center, smoothly fading to the edge. Restore fades the existing protection mask.';
 this.controls=[];function numeric(text,key,lo,hi,value){var n=new NumericControl(self);n.label.text=STHoverCaption(n,text,2);n.setRange(lo,hi);n.setPrecision(2);n.slider.setRange(0,100);n.setValue(value*100);n.onValueUpdated=function(v){self.cfg[key]=v/100;self.invalidate();};self.controls.push(n);return n;}
 this.strength=numeric('Intensity (%)','strength',0,225,.75);
 function button(text,fn){var b=new PushButton(self);b.text=STHoverCaption(b,text,0);b.onClick=fn;return b;}
 this.clearPreviewCache=function(){self.previewPending=false;if(self.previewCache){self.previewCache.image.free();self.previewCache=null;}};
 this.renderLive=function(){if(!self.model||!self.previewCache)return;self.showFog.checked=false;self.showTarget.checked=false;self.model.config.strength=self.cfg.strength;self.correctedBitmap=SRCLivePreview(self.previewCache,self.cfg.strength,self.autoStretch.checked?self.display:null);self.before.checked=false;self.updateBitmap();self.status.text=self.previewCache.maxDelta<=1e-10?'No positive background excess above the reference. Check the background reference.':'Live intensity '+(self.cfg.strength*100).toFixed(1)+'% — corrected image shown; fog overlay off.';};
 this.strength.onValueUpdated=function(v){self.cfg.strength=v/100;self.activeRecord=null;if(!self.work){self.status.text='Load an image first.';return;}if(self.busy)return;try{if(!self.model||!self.previewCache){self.clearPreviewCache();self.model=self.buildCorrection();self.previewCache=SRCPreviewCache(self.work,self.model);}self.renderLive();self.refresh();}catch(e){self.clearPreviewCache();self.model=null;self.refresh();SRCError(e);}};
 this.ensureTarget=function(){if(self.work&&self.cfg.protect&&!self.cfg.targetMask)self.cfg.targetMask=SRCAutoTargetMask(self.work);};
 this.setFog=function(m,points){self.ensureTarget();if(!self.fogModel){var pts=points|| (self.points.length?self.points:SRCSuggest(self.work,self.cfg).points);self.fogModel=SRCLocalFog(self.work,pts,self.cfg);}self.fogMap=SRCFogMap(self.fogModel,self.fogSensitivity.value,self.backgroundReference);self.fogLegend.text='Local fog: blue > cyan > yellow > red | '+self.fogMap.sampleCount+' patches; target area unmarked.';};
 this.buildCorrection=function(){self.setFog(null);if(!self.points.length)self.points=self.fogModel.samples.map(function(p){return {x:p.x,y:p.y};});return SRCLocalCorrection(self.fogModel,self.cfg,self.backgroundReference);};
 this.referenceChanged=function(){self.clearPreviewCache();self.model=null;self.activeRecord=null;self.correctedBitmap=null;self.before.checked=true;self.output.enabled=false;self.status.text='Background reference changed. Build the gradient map again before creating output.';};
 this.estimateFog=function(){if(!self.work||self.busy)return;try{self.setFog(null);}catch(e){self.fogMap=null;self.fogLegend.text='Fog estimate unavailable. Review the target mask and try again.';SRCError(e);}};
 this.populateReferences=function(){var prior=self.backgroundReference?self.backgroundReference.viewId:null;self.backgroundList.clear();self.backgroundList.addItem('Automatic — local background');self.backgroundList.currentItem=0;self.referenceViews=[null];var windows=ImageWindow.windows;for(var i=0;i<windows.length;i++){var list=[windows[i].mainView].concat(windows[i].previews);for(var j=0;j<list.length;j++){self.referenceViews.push(list[j]);self.backgroundList.addItem(list[j].fullId);if(list[j].fullId==prior)self.backgroundList.currentItem=self.referenceViews.length-1;}}if(prior&&self.backgroundList.currentItem==0){self.backgroundReference=null;self.referenceChanged();self.backgroundNote.text='Reference closed; using automatic estimate.';if(self.fogModel)self.setFog(self.fogModel);self.updateBitmap();}};
 this.selectReference=function(index){try{var ref=index>0?SRCBackgroundReference(self.referenceViews[index],self.work?self.work.numberOfChannels:self.views.currentView.image.numberOfChannels):null;self.backgroundReference=ref;self.referenceChanged();self.backgroundNote.text=ref?'Reference: '+ref.viewId+' | median linear level '+ref.luminanceLevel.toExponential(3):'Background reference: automatic estimate';if(self.fogModel)self.setFog(self.fogModel);else if(self.showFog.checked)self.estimateFog();self.updateBitmap();}catch(e){self.backgroundReference=null;self.referenceChanged();self.backgroundList.currentItem=0;self.backgroundNote.text='Background reference: automatic estimate';if(self.fogModel)self.setFog(self.fogModel);self.updateBitmap();SRCError(e);}};
 this.invalidate=function(){self.clearPreviewCache();self.points=[];self.rejected=[];self.fogMap=null;self.fogModel=null;self.canvas.fog=null;self.fogLegend.text='Fog mask needs refitting after settings/sample changes.';self.activeRecord=null;self.model=null;self.correctedBitmap=null;self.before.checked=true;self.canvas.config=self.cfg;self.canvas.update();self.canvas.repaint();self.output.enabled=false;self.status.text='Settings changed. Move Intensity to rebuild the gradient map.';};
 this.refresh=function(){var ready=!!self.work;self.load.enabled=!self.busy&&!self.preferencesLocked;self.fit.enabled=ready&&!self.busy;self.cancel.enabled=self.busy;self.output.enabled=!!self.model&&!self.busy;self.closeButton.enabled=!self.busy;self.views.enabled=!self.busy;self.backgroundList.enabled=!self.busy;self.refreshReferences.enabled=!self.busy;self.before.enabled=!self.busy;self.autoStretch.enabled=!self.busy;self.showFog.enabled=ready&&!self.busy;self.fogSensitivity.enabled=ready&&!self.busy;self.mode.enabled=!self.busy;self.linked.enabled=!self.busy;self.protect.enabled=!self.busy;self.protectPixels.enabled=!self.busy;self.exportJSON.enabled=!!self.model&&!self.busy;self.showTarget.enabled=ready&&!self.busy;self.mapMode.enabled=ready&&!self.busy;self.brushMode.enabled=ready&&!self.busy;self.brushSize.enabled=ready&&!self.busy;self.detectTarget.enabled=ready&&!self.busy;for(var i=0;i<self.controls.length;i++)self.controls[i].enabled=!self.busy;};
 this.updateBitmap=function(){if(!self.work)return;self.canvas.bitmap=self.before.checked||!self.correctedBitmap?self.originalBitmap:self.correctedBitmap;self.canvas.fog=self.showFog.checked?self.fogMap:null;self.canvas.config=self.cfg;self.canvas.showTarget=self.showTarget.checked;self.canvas.showGradientEdits=self.mapMode.currentItem==0&&self.showFog.checked;self.canvas.update();self.canvas.repaint();};
 this.load=button('Load selected image',function(){var v=self.views.currentView;if(v.isNull)return;try{if(v.image.sampleType!=SampleType_Real||[1,3].indexOf(v.image.numberOfChannels)<0)throw new Error('Use floating-point mono/RGB main images without alpha channels.');var snap=new Image(v.image),work=new Image(snap);snap.resetSelections();work.resetSelections();var scale=Math.min(1,700/work.width,480/work.height);if(scale<1)work.resample(scale);if(self.work)self.work.free();if(self.snapshot)self.snapshot.free();self.clearPreviewCache();self.snapshot=snap;self.work=work;self.cfg.targetMask=null;self.cfg.gradientMask=null;self.status.text='Detecting extended targets...';processEvents();self.ensureTarget();self.showTarget.checked=true;if(self.backgroundReference&&self.backgroundReference.channels!=work.numberOfChannels){self.backgroundReference=null;self.backgroundList.currentItem=0;self.backgroundNote.text='Channel count changed; using automatic background.';}self.records=[];self.activeRecord=null;self.fogMap=null;self.fogModel=null;self.sourceInfo={viewId:v.fullId,width:snap.width,height:snap.height,channels:snap.numberOfChannels,bitsPerSample:snap.bitsPerSample};self.points=[];self.rejected=[];self.model=null;self.display=SRCDisplaySettings(work);self.originalBitmap=self.autoStretch.checked?SRCDisplay(work,self.display):work.render();self.correctedBitmap=null;self.before.checked=true;if(self.showFog.checked)self.estimateFog();self.updateBitmap();self.status.text='Source frozen. Review the yellow target mask; use Protect/Restore brushes if needed, then move Intensity.';}catch(e){SRCError(e);}self.refresh();});
 this.refreshReferences=button('Refresh references',function(){self.populateReferences();});
 this.cancel=button('Cancel correction',function(){self.cancelRequested=true;self.status.text='Cancelling...';});
 this.detectTarget=button('Re-detect target mask',function(){if(!self.work)return;self.busy=true;self.refresh();self.status.text='Detecting extended targets...';processEvents();try{self.cfg.targetMask=SRCAutoTargetMask(self.work);self.invalidate();self.showTarget.checked=true;self.updateBitmap();self.status.text='Automatic target mask ready. Review yellow regions and edit with Protect/Restore brush.';}catch(e){SRCError(e);}finally{self.busy=false;self.refresh();}});
 this.fit=button('Build gradient map / preview',function(){if(!self.work)return;self.activeRecord=null;self.cancelRequested=false;self.busy=true;self.refresh();self.status.text='Building local gradient map and caching preview pixels...';processEvents();try{self.clearPreviewCache();self.model=self.buildCorrection();self.previewCache=SRCPreviewCache(self.work,self.model);self.renderLive();}catch(e){self.clearPreviewCache();self.model=null;SRCError(e);}finally{self.busy=false;self.refresh();}});
 this.output=button('Create corrected image',function(){if(!self.model||!self.snapshot)return;self.previewPending=false;self.model.config.strength=self.cfg.strength;self.busy=true;self.cancelRequested=false;self.refresh();var w=null,corrected=null;try{
  SATRunProgress('Smart Gradient Correction — Creating output',function(report){self.status.text='Computing corrected pixels...';processEvents();
  corrected=SRCApply(self.snapshot,self.model,function(f){report(5+85*f,"Correcting full-resolution pixels");},function(){return self.cancelRequested;});
  if(self.cancelRequested)throw new Error('Correction cancelled. No output image created.');
  report(95,"Writing the output image",true);var im=self.snapshot,C=im.numberOfChannels;w=new ImageWindow(im.width,im.height,C,im.bitsPerSample==64?64:32,true,C==3,'SmartGradientCorrected');var view=w.mainView,commitError=null;
  view.beginProcess(UndoFlag_NoSwapFile);try{view.image.assign(corrected);}catch(e){commitError=e;}finally{try{view.endProcess();}catch(endError){if(!commitError)commitError=endError;}}
  if(commitError)throw commitError;w.show();if(self.activeRecord)self.activeRecord.outputViewId=view.fullId;self.status.text='Created '+view.fullId+'. Original unchanged; no preview stretch applied.';w=null;
 },function(){self.cancelRequested=true;});}catch(e){if(w)try{w.forceClose();}catch(closeError){}SRCError(e);}finally{if(corrected)corrected.free();self.busy=false;self.refresh();}});

 this.exportJSON=button('Save gradient JSON',function(){if(!self.model)return;var d=new SaveFileDialog;d.caption='Save live gradient correction feedback';d.filters=[['JSON files','.json']];d.initialPath='SmartGradientFeedback-'+new Date().getTime()+'.json';if(!STScreenFit.execute(d))return;try{var report={schemaVersion:1,toolVersion:SRC_VERSION,workflow:'liveIntensity',intensityPercent:self.cfg.strength*100,comparisons:self.records,backgroundReference:self.backgroundReference?JSON.parse(JSON.stringify(self.backgroundReference)):null,fogMask:{visible:self.showFog.checked,localSamples:self.fogModel?self.fogModel.samples:null,summary:self.fogMap?{method:self.fogMap.method,noiseFloor:self.fogMap.noiseFloor,reference:self.fogMap.reference,sensitivity:self.fogMap.sensitivity,highExcess:self.fogMap.highExcess}:null},currentOutputModel:self.model?JSON.parse(JSON.stringify(self.model)):null};var text=JSON.stringify(report,null,2);File.writeTextFile(d.fileName,text);if(File.readTextFile(d.fileName)!=text)throw new Error('JSON verification failed.');self.status.text='Saved gradient model and live intensity. Send this JSON with your screenshot.';}catch(e){SRCError(e);}});
 this.closeButton=button('Close',function(){self.ok();});
 this.targetStroke=null;
 this.canvasPosition=function(px,py){if(!self.work)return null;var scale=Math.min(self.canvas.width/self.work.width,self.canvas.height/self.work.height),w=self.work.width*scale,h=self.work.height*scale,nx=(px-(self.canvas.width-w)/2)/w,ny=(py-(self.canvas.height-h)/2)/h;if(nx<0||nx>1||ny<0||ny>1)return null;return {x:nx,y:ny};};
 this.editModeChanged=function(){self.targetStroke=null;self.brushMode.clear();self.brushMode.addItem('View — no painting');self.brushMode.addItem(self.mapMode.currentItem==0?'Include fog — paint':'Protect target — paint');self.brushMode.addItem(self.mapMode.currentItem==0?'Restore automatic — erase':'Restore background — erase');self.brushMode.currentItem=0;if(self.mapMode.currentItem==0){self.showTarget.checked=false;self.showFog.checked=true;self.estimateFog();}else{self.ensureTarget();self.showTarget.checked=true;}self.updateBitmap();};
 this.paintTarget=function(p){if(!p)return;var radius=[.025,.05,.10][self.brushSize.currentItem],aspect=self.work.width/self.work.height,a=self.targetStroke||p,dist=Math.sqrt(Math.pow((a.x-p.x)*aspect,2)+Math.pow(a.y-p.y,2)),steps=Math.max(1,Math.ceil(dist/(radius*.5))),mask=self.mapMode.currentItem==0?self.cfg.gradientMask:self.cfg.targetMask;for(var i=1;i<=steps;i++)SRCBrushTarget(mask,a.x+(p.x-a.x)*i/steps,a.y+(p.y-a.y)*i/steps,radius,self.brushMode.currentItem==1,aspect);self.targetStroke=p;self.updateBitmap();};
 this.canvas.onMousePress=function(px,py,button){if(self.busy||!self.work||self.brushMode.currentItem==0||button!=MouseButton_Left)return;var p=self.canvasPosition(px,py);if(!p)return;self.ensureTarget();self.invalidate();if(self.mapMode.currentItem==0){if(!self.cfg.gradientMask){var w=64,h=SRCClamp(Math.round(w*self.work.height/self.work.width),24,80),cells=[];for(var i=0;i<w*h;i++)cells.push(0);self.cfg.gradientMask={width:w,height:h,cells:cells,protectedFraction:0};}self.showFog.checked=true;self.showTarget.checked=false;}else{self.protect.checked=true;self.cfg.protect=true;if(!self.cfg.targetMask)self.cfg.targetMask=SRCAutoTargetMask(self.work);self.showTarget.checked=true;}self.targetStroke=p;self.paintTarget(p);};
 this.canvas.onMouseMove=function(px,py){if(self.targetStroke&&!self.busy)self.paintTarget(self.canvasPosition(px,py));};
 this.canvas.onMouseRelease=function(){if(!self.targetStroke)return;self.targetStroke=null;if(self.mapMode.currentItem==0){try{self.setFog(null);self.updateBitmap();self.status.text='Gradient map updated from painted background. Move Intensity to preview correction.';}catch(e){SRCError(e);}}else self.status.text='Protection map edited. Move Intensity to rebuild correction.';};
 this.mapMode.onItemSelected=function(){self.editModeChanged();};this.mode.onItemSelected=function(){if(self.busy)return;self.cfg.mode=self.mode.currentItem;self.invalidate();if(self.work){self.busy=true;self.refresh();try{self.model=self.buildCorrection();self.previewCache=SRCPreviewCache(self.work,self.model);self.renderLive();}catch(e){self.clearPreviewCache();self.model=null;SRCError(e);}finally{self.busy=false;self.refresh();}}};this.linked.onCheck=function(v){self.cfg.linked=v;self.invalidate();};this.protect.onCheck=function(v){self.cfg.protect=v;self.invalidate();};this.protectPixels.onCheck=function(v){self.cfg.protectPixels=v;self.invalidate();};this.showTarget.onCheck=function(){self.ensureTarget();self.updateBitmap();};this.brushMode.onItemSelected=function(i){self.targetStroke=null;if(i>0){self.ensureTarget();self.showTarget.checked=self.mapMode.currentItem==1;self.showFog.checked=self.mapMode.currentItem==0;if(self.showFog.checked)self.estimateFog();self.updateBitmap();}};this.backgroundList.onItemSelected=function(i){self.selectReference(i);};this.fogSensitivity.onValueUpdated=function(v){if(self.fogModel){self.fogMap=SRCFogMap(self.fogModel,v,self.backgroundReference);self.updateBitmap();}};this.showFog.onCheck=function(v){if(v&&!self.fogMap)self.estimateFog();self.updateBitmap();};this.before.onCheck=function(){self.updateBitmap();};this.autoStretch.onCheck=function(){if(!self.work)return;var original=self.before.checked;self.originalBitmap=self.autoStretch.checked?SRCDisplay(self.work,self.display):self.work.render();if(self.model&&self.previewCache)self.renderLive();self.before.checked=original;self.updateBitmap();};
 this.onClose=function(){if(self.busy)return false;self.clearPreviewCache();return true;};
 var left=new VerticalSizer;left.spacing=6;left.add(this.canvas);left.add(this.before);left.add(this.autoStretch);left.add(this.showFog);left.add(this.fogLegend);left.add(this.fogSensitivity);
 var right=new VerticalSizer;right.spacing=5;right.add(this.mode);right.add(this.linked);right.add(this.protect);right.add(this.protectPixels);right.add(this.showTarget);right.add(this.mapMode);right.add(this.brushMode);right.add(this.brushSize);right.add(this.detectTarget);right.add(this.strength);right.add(this.fit);right.add(this.exportJSON);right.add(this.output);right.add(this.cancel);right.addStretch();
 var referenceRow=new HorizontalSizer;referenceRow.spacing=6;var referenceLabel=new Label(this);referenceLabel.text='Background reference:';referenceRow.add(referenceLabel);referenceRow.add(this.backgroundList,100);referenceRow.add(this.refreshReferences);var top=new HorizontalSizer;top.spacing=6;top.add(this.views);top.add(this.load);var body=new HorizontalSizer;body.spacing=8;body.add(left,100);body.add(STScreenFit.panel(this,right));var bottom=new HorizontalSizer;bottom.addStretch();bottom.add(this.closeButton);this._stBody=new VerticalSizer;this._stBody.margin=8;this._stBody.spacing=6;this._stBody.add(top);this._stBody.add(referenceRow);this._stBody.add(this.backgroundNote);this._stBody.add(body);this._stBody.add(this.status);this._stBody.add(bottom);this._stFooter=bottom;this.populateReferences();STScreenFit.adjust(this);this.refresh();
}
SRCDialog.prototype=new Dialog;

 if(view){var d=new SRCDialog;try{d.views.currentView=view;d.load.onClick();STScreenFit.execute(d);}finally{d.clearPreviewCache();if(d.work)d.work.free();if(d.snapshot)d.snapshot.free();}return null;}
 var cfg=SRCDefaults();cfg.targetMask=SRCAutoTargetMask(image);
 var points=[],noises=[],tileValues=[],all=[],W=16,H=12,aspect=image.width/image.height;
 for(var ty=0;ty<H;ty++)for(var tx=0;tx<W;tx++){
  var nx=(tx+.5)/W,ny=(ty+.5)/H,v=SRCPatch(image,nx,ny),level=SRCY(v),coverage=0;
  for(var oy=-1;oy<=1;oy++)for(var ox=-1;ox<=1;ox++)coverage+=SRCWeight(SRCClamp(nx+ox/(3*W),0,1),SRCClamp(ny+oy/(3*H),0,1),cfg);
  var patch={x:nx,y:ny,level:level,tile:ty*W+tx,eligible:coverage/9>.55};all.push(patch);
  if(patch.eligible){points.push({x:nx,y:ny});tileValues.push(patch);}
 }
 if(points.length<24)return {detected:false,status:"inconclusive",reason:"Too little measurable background outside target protection",samples:points.length};
 // No brightness-tail rejection: local fog must remain eligible for the map.
 var local=SRCLocalFog(image,points,cfg),rows=[],values=[];
 for(var i=0;i<local.samples.length;i++){var q=local.samples[i];rows.push(SRCBasis(q.x,q.y,cfg,aspect));values.push(q.level);}
 var fit=SRCFitChannel(rows,values),modeled=rows.map(function(r){return SRCDot(r,fit);}),baseline=SRCQuantile(values,.15);
 var threshold=Math.max(1e-9,3*local.noise,.04*Math.abs(baseline));
 var broad=SRCQuantile(modeled,.90)-SRCQuantile(modeled,.10),eligible={},peak=0;
 for(i=0;i<tileValues.length;i++){var q=tileValues[i];eligible[q.tile]=q;peak=Math.max(peak,q.level-baseline);}
 var hot=[],supported=0;
 for(i=0;i<tileValues.length;i++){q=tileValues[i];var x=q.tile%W,y=Math.floor(q.tile/W),neighbors=0;
  if(q.level-baseline<=threshold)continue;
  for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H||(!dx&&!dy))continue;var n=SSTOptional(eligible,yy*W+xx,null);if(n&&n.level-baseline>threshold)neighbors++;}
  if(neighbors>=2){hot.push(q.tile);supported++;}
 }
 var meshExcess=SRCQuantile(local.field,.95)-SRCQuantile(local.field,.15),localDetected=supported>=3&&meshExcess>threshold;
 var detected=broad>threshold||localDetected;
 var coverage=points.length/(W*H),border=all.filter(function(q){return q.x<.1||q.x>.9||q.y<.1||q.y>.9;}),borderCovered=border.filter(function(q){return q.eligible;}).length/Math.max(1,border.length);
 var uncertain=coverage<.35||borderCovered<.5;
 return {detected:detected,status:detected?"detected":uncertain?"inconclusive":"clear",reason:detected?(localDetected?"Localized or uneven background excess":"Broad background variation"):uncertain?"Protected regions limit background coverage":"No significant background variation measured",samples:points.length,coverage:coverage,broadVariation:broad,localExcess:meshExcess,threshold:threshold,hotTiles:supported,method:"Source-linear local mesh and connected elevated background patches outside target protection; advisory"};
}

function SSTPhase(s){
 if(!s)return "";
 if(s.stage=="round")return "Phase 1: Group "+(s.round+1)+"/9";
 if(s.stage=="shortlist")return "Phase 2: Select finalists";
 if(s.stage=="blend")return "Phase 2: Originals and finalist blends";
 if(s.stage=="refine")return "Phase 2: Branch "+(s.branch+1)+"/"+s.shortlist.length+" — Group "+(s.refineStep+1)+"/3";
 if(s.stage=="playoff")return "Phase 3: Finalist comparison";
 if(s.stage=="compare")return "Phase 3: Your favorite vs Trainer favorite";
 return "Complete";
}
function SSTRecipeLabel(p){
 var method=p.quick?"Quick Stretch":SSTOptional(p,"hdr",null)?"HDR":SSTOptional(p,"scenario",(p.family<3?"RGB ":"Linked ")+String(SSTOptional(p,"method","stretch")).toUpperCase());
 var shape=SSTOptional(p,"shape",[]),target=SSTOptional(p,"target",null),details=[];
 if(target!==null)details.push("target "+Number(target).toFixed(3));
 if(shape.length)details.push("curve "+shape.map(function(v){return Number(v).toPrecision(3);}).join("/"));
 var steps=SSTOptional(p,"finishRefinements",[]);if(steps.length){var last=steps[steps.length-1];details.push(["faint","midtones","brightness","highlights"][last.mode]+" "+(last.strength>=0?"+":"")+Number(last.strength).toFixed(2));}
 return method+(details.length?" — "+details.join("; "):"");
}
function SSTCandidateLabel(blind,stage,index,badge,p){
 var identity=stage=="compare"?(index==0?"YOUR FAVORITE":"TRAINER FAVORITE"):"Candidate "+(index+1);
 return badge+" — "+identity+(!blind&&p?"\n"+SSTRecipeLabel(p):"");
}

function SSTExplain(s){
 if(!s||s.stage!="complete"||!s.finalWinner)return "Make your final choice to see its explanation.";
 var p=s.finalWinner,root=null,id=p.rootId||p.id;
 if(SSTOptional(p,"referenceCurve",null))return "Paired GHS reference: monotonic channel curves learned from your matched linear M31 and preferred GHS output. Finishing refinements: "+JSON.stringify(SSTOptional(p,"finishRefinements",[]))+". Brightness gamma: "+(p.finishGamma||1)+". Full curves are saved in preference JSON.";
 if(SSTOptional(p,"recipeBlend",null)){var blend=p.recipeBlend,weights=SSTOptional(blend,"weights",[.5,.5]);return "Blend of fully processed outputs: "+blend.recipes.map(function(r,i){return Math.round(100*weights[i])+"% "+r.id;}).join(" + ")+". RGB uses common weights. Later refinements apply after blending. Complete recipes are saved in JSON.";}
 for(var i=0;i<s.candidates.length;i++)if(s.candidates[i].id==id){root=s.candidates[i];break;}
 function number(v){return Number(v).toPrecision(7);}
 var method=SSTOptional(p,"hdr",null)?"Source-aware HDR with independent background, nebula and highlight anchors":p.selectiveMidtone!==undefined?"Selective highlight shoulder with ordinary MTF midtones":p.quick?"Quick Stretch — full default pipeline with your selected settings":SST_FAMILIES[p.family];
 var lineage=root&&root.quick?(SSTSameSettings(p,root)?"You picked the unchanged Quick Stretch baseline.":"You picked a VARIATION OF QUICK STRETCH, refined from the full default Quick Stretch baseline."):p.family==0?"You picked the Quick STF family, not the full current Quick Stretch pipeline.":"You picked another stretch method, not a variation of Quick Stretch.";
 var a=["WHAT YOU PICKED","",method,lineage,"Target category: "+s.target,"Dataset: "+(s.label||s.source||"Unnamed"),"Recipe: "+p.id,"Original recipe: "+id,"", "HOW THIS STRETCH WORKS"];
 if(SSTOptional(p,"hdr",null)){a.push("A linked peak curve preserves RGB ratios, keeps background brightness separate from nebula brightness, and compresses the bright core with a logarithmic shoulder. Source-unit anchors are identical in previews and native output. Version 2 adds a monotonic shoulder contrast curve and restrained saturation that preserves luminance and bounds RGB without clipping. HDR settings: "+JSON.stringify(p.hdr));}
 else if(p.selectiveMidtone!==undefined){a.push("Uses a linked RGB curve: ordinary MTF below a source-domain knee, then a logarithmic highlight shoulder. Faint-signal lift and highlight ceiling are separate. The transform cannot recover already-clipped source detail.");}
 else if(p.family<3){a.push("Each channel receives its own black point and midtone curve. In RGB, these independent curves can change the color balance.");a.push("The black point maps values at or below it to zero. A smaller MTF midtone parameter produces a stronger lift; 0.5 is neutral.");}
 else{a.push("The curve acts on luminance and scales RGB together. RGB ratios are preserved until the brightest channel limits the lift to avoid clipping.");
  if(p.method=="asinh")a.push("An asinh curve lifts faint signal and compresses brighter signal. A larger shape parameter gives a stronger lift.");
  else if(p.method=="log")a.push("A logarithmic curve lifts faint signal and compresses brighter signal. A larger shape parameter gives a stronger lift.");
  else if(p.method=="gamma")a.push("A power curve redistributes brightness. Gamma below 1 lifts signal; smaller values lift more strongly. Gamma above 1 darkens.");
  else a.push("The MTF curve controls the midtone lift. Smaller midtone parameters give a stronger lift; 0.5 is neutral.");
  if(p.family==7)a.push("A second MTF pass is blended most strongly into the midtones and fades toward black and white.");
  if(p.family==8)a.push("The protected curve leaves luminance at or above 0.7 unchanged. RGB clipping protection can further limit the lift.");
 }
 if(p.quick)a.push("After the channel stretch, linked linear endpoints map the current image minimum to black and maximum to white. Auto High Contrast then boosts eligible local detail with noise, background, and highlight protection. Faint Nebulosity and Auto Color & Brightness are disabled in this recipe.");
 if(SSTOptional(p,"finishRefinements",null))a.push("Bounded linked refinements after the calibrated parent pipeline: "+JSON.stringify(p.finishRefinements));
 if(SSTOptional(p,"objectLift",null))a.push("A final linked peak midtone curve raises compact-object brightness while anchoring the background; RGB ratios are preserved. Settings: "+JSON.stringify(p.objectLift));
 if(SSTOptional(p,"endpoints",null))a.push("Final linked RGB endpoint placement: black "+number(p.endpoints.black)+", white "+number(p.endpoints.white)+". Applied after final gamma using identical saved endpoints for preview and native output. Samples may miss rare native extremes.");
 a.push("","YOUR SETTINGS");
 for(i=0;i<p.shape.length;i++){var channel=p.family<3?(p.shape.length==1?"Mono":["Red","Green","Blue"][i]):"Luminance";
  a.push(channel+": black point "+number(p.black[i])+"; "+(p.method=="mtf"?"MTF midtones":p.method=="gamma"?"gamma":"shape strength")+" "+number(p.shape[i]));
 }
 if(p.sourcePedestal)a.push("SHO channel background offsets removed before the linked stretch: "+p.sourcePedestal.join(", ")+". Saved offsets and channel gains are identical for preview and native output. Channel gains: "+JSON.stringify(SSTOptional(p,"sourceGain",[1,1,1]))+".");
 if(p.finishGamma!==undefined&&p.finishGamma!=1)a.push("Final brightness gamma: "+number(p.finishGamma)+". Below 1 brightens; above 1 darkens. This common power curve is applied after all other passes, preserves black/white endpoints, and can change RGB balance.");
 if(p.second>0)a.push("Second-pass MTF midtones: "+number(p.second));
 if(p.quick)a.push("Linked endpoints: enabled; Auto High Contrast multiplier: "+number(p.contrast)+" (1 = current default).");
 a.push("Original recipe's nominal median target: "+number(p.target)+". This is a recipe label, not a measurement of the final image; refinement and later passes can change the result.");
 if(s.flow==2){a.push("","HOW YOU REFINED IT", "You selected "+s.shortlist.length+" finalist"+(s.shortlist.length==1?"":"s")+" and refined each through three successive grids. Each grid retained its parent and offered eight variations, with progressively smaller changes.");
  var branch=-1;for(i=0;i<s.shortlist.length;i++)if((s.shortlist[i].rootId||s.shortlist[i].id)==id)branch=i;
  if(branch>=0)a.push("Your final choice came from refinement branch "+(branch+1)+".");
  if(root){var changed=false;
   for(i=0;i<p.shape.length;i++){
    var channel=p.family<3?(p.shape.length==1?"Mono":["Red","Green","Blue"][i]):"Luminance";
    if(p.shape[i]!=root.shape[i]){changed=true;var stronger=p.method=="mtf"||p.method=="gamma"?p.shape[i]<root.shape[i]:p.shape[i]>root.shape[i];a.push(channel+" curve: "+number(root.shape[i])+" → "+number(p.shape[i])+" ("+(stronger?"stronger":"gentler")+" curve lift).");}
    if(p.black[i]!=root.black[i]){changed=true;a.push(channel+" black point: "+number(root.black[i])+" → "+number(p.black[i])+" ("+(p.black[i]>root.black[i]?"more":"less")+" shadow clipping before later passes).");}
   }
   if(p.second!=root.second){changed=true;a.push("Second-pass midtones: "+number(root.second)+" → "+number(p.second)+".");}
   if(p.quick&&p.contrast!=root.contrast){changed=true;a.push("Auto High Contrast multiplier: "+number(root.contrast)+" → "+number(p.contrast)+".");}
   if((p.finishGamma||1)!=(root.finishGamma||1)){changed=true;a.push("Final brightness gamma: "+number(root.finishGamma||1)+" → "+number(p.finishGamma||1)+".");}
   if(!changed)a.push("You retained the original recipe's settings. None of the variations you ultimately chose changed them.");
  }
 }else a.push("","This result came from the original tournament workflow, without refinement grids.");
 var notes=[];for(i=0;i<s.choices.length;i++)if(s.choices[i].note&&String(s.choices[i].note).replace(/\s/g,"").length)notes.push((i+1)+". ["+s.choices[i].stage+"] "+s.choices[i].note);
 a.push("","YOUR RECORDED REASONS");a.push(notes.length?notes.join("\n"):"No reasons were recorded. The trainer knows which image you selected, but cannot infer why you preferred its appearance.");
 if(s.linearInfo)a.push("","IMAGE MEASUREMENTS", "Linear-source descriptors are saved, including highlight percentiles, clipping fractions, an 8 x 6 regional grid and RGB balance. Percentiles and fractions are sample estimates; background/noise are heuristic.");
 if(s.winnerInfo)a.push("Winning preview median luminance: "+number(s.winnerInfo.measurement.luminance.median)+"; any-channel near-saturation fraction: "+number(s.winnerInfo.measurement.clipping.anyChannelNearSaturationFraction)+". These describe the working preview, not the native output.");
 a.push("","These settings describe this dataset's winning recipe. One tournament does not establish a general preference for every image of this target type.");
 return a.join("\n");
}

// End of pure engine. The following code requires PixInsight's PJSR UI.
// FITS strings are ASCII, <=60 payload characters per keyword. Concatenate
// SJ000001..SJnnnnnn, decodeURIComponent, then JSON.parse to recover the recipe.
// Source structural/scaling/checksum cards must be regenerated for this output.
// Keep FITS metadata bounded; full regional arrays remain in preference JSON.
function SSTHeaderMeasurements(info){
 if(!info)return null;var out={},keys=["schema","measurementVersion","scope","width","height","channels","bitsPerSample","sampling","luminance","channelStatistics","clipping","background","noise","rgbBalance"];
 for(var i=0;i<keys.length;i++)if(Object.prototype.hasOwnProperty.call(info,keys[i]))out[keys[i]]=SSTCopy(info[keys[i]]);
 var spatial=SSTOptional(info,"spatial",null);if(spatial)out.spatial={columns:spatial.columns,rows:spatial.rows,regionalMedianP10:spatial.regionalMedianP10,regionalMedianP90:spatial.regionalMedianP90,fullRegions:"Saved in preference JSON"};
 return out;
}
function SSTCompactHeaderValue(value){
 if(typeof value=="number")return isFinite(value)?Number(value.toPrecision(8)):null;
 if(value instanceof Array)return value.map(SSTCompactHeaderValue);
 if(value&&typeof value=="object"){var out={};for(var k in value)if(Object.prototype.hasOwnProperty.call(value,k))out[k]=SSTCompactHeaderValue(value[k]);return out;}
 return value;
}
function SSTOutputKeywords(sourceKeywords,session,recipe,created)
{
 var out=[],i,k;
 for(i=0;i<sourceKeywords.length;i++){
  k=sourceKeywords[i];var name=String(k.name).toUpperCase();
  if(/^(SIMPLE|BITPIX|NAXIS[0-9]*|EXTEND|XTENSION|PCOUNT|GCOUNT|BSCALE|BZERO|BLANK|CHECKSUM|DATASUM|END)$/.test(name)||/^SST[A-Z0-9]*$/.test(name)||/^SJ[0-9]{6}$/.test(name))continue;
  out.push(new FITSKeyword(k.name,k.value,k.comment));
 }
 function str(name,value,comment){var v=String(value).replace(/[^\x20-\x7e]/g,"?").replace(/'/g,"''");out.push(new FITSKeyword(name,"'"+v.substr(0,60)+"'",comment));}
 str("SSTVER",SST_VERSION,"Smart Stretch Trainer version");
 str("SSTBUILD","2026-10-12-FITS3","Trainer metadata build");
 str("SSTRECP",recipe.id,"Applied recipe ID");
 str("SSTMETH",SSTOptional(recipe,"recipeBlend",null)?"blend":recipe.method,"Base stretch method");
 str("SSTTARG",session.target,"Training target category");
 str("SSTDATE",created,"Output creation UTC");
 str("SSTENC","URI-JSON-1","Join SJ cards; URI decode; parse JSON");
 var payload={schema:"smart-stretch-fits-1",version:SST_VERSION,build:"2026-10-12-FITS3",created:created,
  source:session.source,sourceFingerprint:session.fingerprint,sessionId:session.id,
  target:session.target,palette:session.palette,recipe:SSTCopy(recipe),
  linearInfo:SSTHeaderMeasurements(SSTOptional(session,"linearInfo",null)),
  workingStats:session.stats?{channels:SSTCopy(session.stats.channels),luminance:SSTCopy(session.stats.luminance),hdrAssessment:SSTCopy(SSTOptional(session.stats,"hdrAssessment",null))}:null,
  dataLabels:session.dataLabels?SSTCopy(session.dataLabels):null,
  measurementsUpdated:session.measurementsUpdated||null};
 out.push(new FITSKeyword("SSTLIN",session.linearInfo?"T":"F","Original linear measurements included"));
 payload.metadataScope="Compact measurements; full regional statistics and point lists remain in preference JSON";
 var encoded=encodeURIComponent(JSON.stringify(SSTCompactHeaderValue(payload))).replace(/'/g,"%27"),count=Math.ceil(encoded.length/60);
 if(count>128){delete payload.workingStats;payload.metadataScope+="; duplicate working statistics omitted to keep header bounded";
  encoded=encodeURIComponent(JSON.stringify(SSTCompactHeaderValue(payload))).replace(/'/g,"%27");count=Math.ceil(encoded.length/60);}
 if(count>128)throw new Error("Compact FITS metadata exceeds 128 cards; output image can be retained without metadata.");
 out.push(new FITSKeyword("SSTNJSON",String(count),"Number of ordered SJ recipe chunks"));
 for(i=0;i<count;i++)out.push(new FITSKeyword("SJ"+("000000"+(i+1)).slice(-6),"'"+encoded.substr(i*60,60)+"'",""));
 out.push(new FITSKeyword("HISTORY","","Smart Stretch Trainer applied recipe; full settings in ordered SJ cards."));
 return out;
}

function SSTError(e){console.criticalln(String(e));new MessageBox(String(e),"Smart Stretch Trainer",StdIcon_Error,StdButton_Ok).execute();}
function SSTCanvas(parent,w,h){
 var c=new Control(parent);if(w>600&&h>400){var size=STScreenFit.previewSize(c,w,h,48,180);w=size.width;h=size.height;}c.setFixedSize(w,h);c.bitmap=null;c.selected=false;
 c.onPaint=function(){var g=new Graphics(this);try{g.fillRect(0,0,this.width,this.height,new Brush(this.selected?0xff147d96:0xff171717));if(this.bitmap){var scale=Math.min((this.width-8)/this.bitmap.width,(this.height-8)/this.bitmap.height),x=(this.width-scale*this.bitmap.width)/2,y=(this.height-scale*this.bitmap.height)/2;g.scaleTransformation(scale);g.drawBitmap(Math.round(x/scale),Math.round(y/scale),this.bitmap);}}finally{g.end();}};return c;
}
function SSTOpenUploadPage(){
 // Only a fixed trusted HTTPS URL is passed to the OS; no user text or file paths.
#ifdef __PJSR_WINDOWS
 var command='rundll32.exe url.dll,FileProtocolHandler '+SST_UPLOAD_URL;
#else
#ifdef __PJSR_MACOSX
 var command='/usr/bin/open '+SST_UPLOAD_URL;
#else
 var command='xdg-open '+SST_UPLOAD_URL;
#endif
#endif
 return ExternalProcess.startDetached(command)>0;
}
function SSTTrainerDialog(){
 this.__base__=Dialog;this.__base__();var self=this;
 this.windowTitle="Smart Stretch Trainer "+SST_VERSION;
 this.phase=new Label(this);this.phase.text="";this.labelGrid=[];this.labelQualities=[];this.labelRanking=[];this.gradientChecked={};this.gradientResult=new Label(this);this.gradientResult.wordWrapping=true;this.gradientResult.text="Gradient check: not run";
 this.dataset={schema:"smart-stretch-trainer-1",version:SST_VERSION,sessions:[]};this.session=null;this.snapshot=null;this.sourceKeywords=[];this.working=null;this.bitmaps=[];this.previewCache=[];this.inspectCache=[];this.inspectSource=null;this.selected=-1;this.multiSelected=[];this.gridReady=false;this.busy=false;this.dirty=false;this.savePath="";this.closingConfirmed=false;this.preferencesLocked=false;
 this.views=STHoverAttach(new ViewList(this),"Choose an open source image to analyze or process.");this.views.getMainViews();
 var active=ImageWindow.activeWindow;if(!active.isNull)this.views.currentView=active.mainView;
 this.target=STHoverAttach(new ComboBox(this),"Choose the astronomical target type used to guide training candidate generation.");for(var i=0;i<SST_TARGETS.length;i++)this.target.addItem(SST_TARGETS[i]);
 this.label=STHoverAttach(new Edit(this),"Enter a recognizable name for this training dataset.");this.label.text=STHoverCaption(this.label,"",0);this.label.toolTip="Dataset name, for example HB3 SHO integration. Saved with each session.";
 this.dataKind=STHoverAttach(new ComboBox(this),"Describe the source data type for recording and matching training examples.");for(var i=0;i<SST_DATA_KINDS.length;i++)this.dataKind.addItem(SST_DATA_KINDS[i]);
 this.dataKind.toolTip="Optional label recorded at session start.";
 this.palette=STHoverAttach(new ComboBox(this),"Choose the image channel mapping so analysis and stretch candidates can account for RGB, HOO, SHO or other palettes.");for(var i=0;i<SST_PALETTES.length;i++)this.palette.addItem(SST_PALETTES[i]);this.palette.toolTip="Existing channel mapping. HOO retains the established stretch pipeline; SHO offers gentle SII red midtone lifts. Frozen when the session starts.";
 this.starKind=STHoverAttach(new ComboBox(this),"Describe whether stars are present or removed in the source image.");for(var i=0;i<SST_STAR_KINDS.length;i++)this.starKind.addItem(SST_STAR_KINDS[i]);this.starKind.currentItem=SST_STAR_KINDS.indexOf("Starless");
 this.start=STHoverAttach(new PushButton(this),"Start analysis or resume the selected training session.");this.start.text=STHoverCaption(this.start,"Start / resume",0);
 this.structure=new Label(this);this.structure.text="Detected structure: Not analyzed — select a linear image and click Start / resume";this.structure.toolTip="Heuristic description of the frozen linear source. This is not object-name recognition or the manually selected target category. Updated when a session starts or resumes.";
 this.status=new Label(this);this.status.text="Select a linear main image and target type, then Start.";
 this.tiles=[];this.buttons=[];var rows=new VerticalSizer;rows.spacing=4;
 for(var row=0;row<3;row++){var rs=new HorizontalSizer;rs.spacing=5;
  for(var col=0;col<3;col++){(function(index){var box=new VerticalSizer;box.spacing=2;
   var tileSize=STScreenFit.tileSize(self,476,272,3,3,430);var tile=SSTCanvas(self,tileSize.width,tileSize.height),button=STHoverAttach(new PushButton(self),"Select this preview candidate for closer inspection or the next step.");button.text=STHoverCaption(button,"Candidate "+(index+1),0);button.enabled=false;
   tile.toolTip="Click to select and open a larger detail preview. Use the button below to select only.";
   function select(){if(self.busy||!self.session||!self.gridReady||index>=SSTGrid(self.session).length)return;
    self.selected=index;
    if((self.session.stage=="shortlist"||self.session.stage=="blend")){var at=self.multiSelected.indexOf(index);if(at>=0)self.multiSelected.splice(at,1);else if(self.multiSelected.length<3)self.multiSelected.push(index);else{SSTError("Select up to three finalists. Deselect one first.");return;}}
    for(var k=0;k<9;k++){self.tiles[k].selected=(self.session.stage=="shortlist"||self.session.stage=="blend")?self.multiSelected.indexOf(k)>=0:k==index;self.tiles[k].update();}self.refreshActions();}
   tile.onMousePress=function(){if(self.busy||!self.session||!self.gridReady||index>=SSTGrid(self.session).length)return;select();self.inspect.onClick();};button.onClick=select;self.tiles.push(tile);self.buttons.push(button);box.add(tile);box.add(button);rs.add(box);
  })(row*3+col);}rows.add(rs);
 }
 this.preferenceStatus=new Label(this);this.preferenceStatus.text="Built-in learned profile available; source match checked at Start.";
 this.blind=new CheckBox(this);this.blind.text=STHoverCaption(this.blind,"Blind labels",0);this.blind.checked=true;this.blind.toolTip="Hide stretch methods and settings. Recommendation status remains visible. Toggle without rerendering or losing selections.";
 this.notes=STHoverAttach(new Edit(this),"Record why you prefer or reject this candidate. Notes are saved with the training record.");this.notes.toolTip="Optional reason: better faint arms, too noisy, core too bright, color preference...";
 this.pick=STHoverAttach(new PushButton(this),"Record the chosen candidate and advance one training step.");this.pick.text=STHoverCaption(this.pick,"Choose selected",0);
 this.reject=STHoverAttach(new PushButton(this),"Skip this group or retain the current refinement parent.");this.reject.text=STHoverCaption(this.reject,"None acceptable",0);this.reject.toolTip="Skip this initial round with no winner. In refinement, keep the parent image and skip to the next step. No replacement grid is generated.";
 this.inspect=STHoverAttach(new PushButton(this),"Open a larger view of the selected candidate.");this.inspect.text=STHoverCaption(this.inspect,"Inspect selected",0);
 this.explain=STHoverAttach(new PushButton(this),"Display the explanation for the selected recommendation.");this.explain.text=STHoverCaption(this.explain,"Explain choice",0);
 this.restartRefine=new PushButton(this);this.restartRefine.text=STHoverCaption(this.restartRefine,"Restart Phase 2",0);this.restartRefine.toolTip="Keep the first nine group winners and start improved refinement in a separate session. The original session is retained.";
 this.output=STHoverAttach(new PushButton(this),"Create a new full-resolution output image from the current processing settings.");this.output.text=STHoverCaption(this.output,"Create native-size image",0);
 this.load=STHoverAttach(new PushButton(this),"Load the selected source or saved preferences as indicated by the control label.");this.load.text=STHoverCaption(this.load,"Load preference JSON",0);this.load.toolTip="Load before starting a session. Reopen the Trainer to load a different preferences file after starting.";
 this.save=STHoverAttach(new PushButton(this),"Save the current progress and preferences as JSON.");this.save.text=STHoverCaption(this.save,"Save progress / preferences",0);
 this.submit=STHoverAttach(new PushButton(this),"Export the training results and open the upload page.");this.submit.text=STHoverCaption(this.submit,"Send Training Data to Don",0);this.submit.toolTip="Export completed sessions, then open Dropbox. Select the exported JSON on that page and click Upload. Includes labels, notes, source names and embedded comparison previews when you choose a different favorite.";
 this.closeButton=STHoverAttach(new PushButton(this),"Close this window.");this.closeButton.text=STHoverCaption(this.closeButton,"Close",0);
 this.triangle=new ToolButton(this);this.triangle.icon=this.scaledResource(":/images/interface/dragObject.png");this.triangle.setFixedSize(24,24);this.triangle.toolTip="Drag to create a workspace launcher icon. Preferences remain in your saved JSON file.";this.triangle.onMousePress=function(){self.newInstance();};
 function named(label,control){var s=new HorizontalSizer;s.spacing=5;var l=new Label(self);l.text=label;s.add(l);s.add(control,100);return s;}
 var top=new HorizontalSizer;top.spacing=5;top.add(this.views,100);top.add(this.target);top.add(this.start);
 var actions=new HorizontalSizer;actions.spacing=5;actions.add(this.pick);actions.add(this.reject);actions.add(this.inspect);actions.add(this.output);actions.add(this.explain);actions.add(this.restartRefine);
 var bottom=new HorizontalSizer;bottom.spacing=5;bottom.add(this.triangle);bottom.add(this.load);bottom.add(this.save);bottom.addStretch();bottom.add(this.closeButton);
 this._stBody=new VerticalSizer;this._stBody.margin=8;this._stBody.spacing=6;this._stBody.add(top);this._stBody.add(this.phase);this._stBody.add(this.gradientResult);this._stBody.add(this.structure);this._stBody.add(named("Dataset:",this.label));var metadata=new HorizontalSizer;metadata.spacing=6;metadata.add(named("Data:",this.dataKind));metadata.add(named("Stars:",this.starKind));metadata.add(named("Palette:",this.palette));metadata.addStretch();this._stBody.add(metadata);this._stBody.add(this.status);this._stBody.add(this.preferenceStatus);this._stBody.add(this.blind);this._stBody.add(rows);this._stBody.add(named("Reason:",this.notes));this._stBody.add(actions);this._stBody.add(this.submit);this._stBody.add(bottom);this._stFooter=bottom;
 this.refreshActions=function(){var ready=!!self.session&&!self.busy,has=ready&&self.gridReady&&self.selected>=0;
  self.pick.text=STHoverCaption(self.pick,ready&&(self.session.stage=="shortlist"||self.session.stage=="blend")?"Begin refinement ("+self.multiSelected.length+" selected)":"Choose selected",0);self.pick.enabled=ready&&self.gridReady&&self.session.stage!="complete"&&((self.session.stage=="shortlist"||self.session.stage=="blend")?self.multiSelected.length>0:has);self.reject.enabled=ready&&self.gridReady&&["round","refine"].indexOf(self.session.stage)>=0;self.inspect.enabled=has;self.explain.enabled=ready&&self.session.stage=="complete";self.restartRefine.enabled=ready&&self.session.flow==2&&self.session.round==9;self.output.enabled=has;self.start.enabled=!self.busy;self.load.enabled=!self.busy&&!self.preferencesLocked;self.save.enabled=!self.busy;self.closeButton.enabled=!self.busy;self.blind.enabled=!self.busy;self.target.enabled=!self.busy;self.views.enabled=!self.busy;self.dataKind.enabled=!self.busy;self.starKind.enabled=!self.busy;self.palette.enabled=!self.busy;self.submit.enabled=!self.busy&&self.dataset.sessions.some(function(s){return s.stage=="complete";});
 };
 this.releaseImages=function(){SSTSourceCacheImage=null;SSTSourceCacheValue=null;self.previewCache=[];self.inspectCache=[];if(self.inspectSource){self.inspectSource.free();self.inspectSource=null;}if(self.working){self.working.free();self.working=null;}if(self.snapshot){self.snapshot.free();self.snapshot=null;}self.bitmaps=[];for(var i=0;i<9;i++)self.tiles[i].bitmap=null;};
 this.saveData=function(){
  var d=new SaveFileDialog;d.caption="Save trainer progress and preferences";d.filters=[["Trainer JSON",".json"]];d.initialPath=self.savePath||"SmartStretchPreferences.json";
  if(!STScreenFit.execute(d))return false;
  if(self.session&&self.session.stage=="complete"&&self.session.finalComparison&&self.session.finalComparison.selected=="user"&&!self.session.comparisonPreviews)try{SSTCaptureComparison(self.session,self.working);}catch(embedError){SSTError("Cannot embed comparison previews: "+embedError);return false;}
  // Keep the previous dataset as a timestamped backup before an overwrite.
  var text=JSON.stringify(self.dataset,null,2),backup=d.fileName+".backup-"+new Date().getTime()+".json";
  try{if(File.exists(d.fileName))File.writeTextFile(backup,File.readTextFile(d.fileName));File.writeTextFile(d.fileName,text);if(File.readTextFile(d.fileName)!=text)throw new Error("Saved JSON verification failed. Previous contents, if any, are in "+backup);self.savePath=d.fileName;self.dirty=false;return true;}catch(e){SSTError(e);return false;}
 };
 this.confirmUnsaved=function(){if(!self.dirty)return true;var answer=new MessageBox("Save your unsaved choices before continuing?","Smart Stretch Trainer",StdIcon_Question,StdButton_Yes,StdButton_No,StdButton_Cancel).execute();if(answer==StdButton_Cancel)return false;return answer!=StdButton_Yes||self.saveData();};
 this.refreshLabels=function(){
  var pm=SSTOptional(self.session,"preferenceModel",null);self.preferenceStatus.text="Active preference examples: "+(pm?pm.examples.length:0)+" (built-in profile used when matched; loaded training can supersede it).";
  var grid=self.labelGrid,q=self.labelQualities,ranking=self.labelRanking;
  if(!self.session)return;
  var eligible=ranking.filter(function(i){var a=SSTOptional(q[i],"learnedAcceptance","unknown");return !q[i].warning&&a!="rejected"&&a!="nearMiss";});
  for(var i=0;i<grid.length;i++){var rejected=SSTOptional(q[i],"learnedAcceptance","unknown")=="rejected",nearMiss=SSTOptional(q[i],"learnedAcceptance","unknown")=="nearMiss";
   var badge=q[i].warning||nearMiss?"CAUTION":rejected?"NOT ACCEPTABLE":i==eligible[0]?"RECOMMENDED":eligible.indexOf(i)>=0&&eligible.indexOf(i)<3?"GOOD":"ALTERNATIVE";
   self.buttons[i].text=SSTCandidateLabel(self.blind.checked,self.session.stage,i,badge,grid[i]);
   self.buttons[i].toolTip="Quality score: "+q[i].heuristicScore.toFixed(1)+"; preference adjustment: "+q[i].preferenceAdjustment.toFixed(2)+"; combined: "+q[i].score.toFixed(1)+". "+(q[i].warning||"Relative recommendation, not an AI judgment.")+"\n"+JSON.stringify(q[i])+(self.blind.checked?"":"\nStretch settings:\n"+JSON.stringify(grid[i],null,2));
  }
 };
 this.showGrid=function(){
  self.phase.text=SSTPhase(self.session);var gridStarted=new Date().getTime();self.busy=true;self.gridReady=false;self.selected=-1;self.multiSelected=[];for(var t=0;t<9;t++)self.buttons[t].enabled=false;self.refreshActions();var grid=SSTGrid(self.session),pref=SSTPreferenceScores(self.dataset,self.session.target,self.session.stats),recommended=-1,best=0;
  for(var q=0;q<grid.length;q++)if((pref.scores[grid[q].id]||0)>best){best=pref.scores[grid[q].id];recommended=q;}
  self.bitmaps=[];var previewSamples=[],qualities=[],qualitySource=SSTQualitySource(self.working);
  try{SSTPrepareGrid(self.session,self.working,function(i,n){self.status.text="Preparing candidate "+(i+1)+" / "+n+"...";processEvents();});
   for(var i=0;i<9;i++){self.tiles[i].bitmap=null;self.tiles[i].selected=false;self.tiles[i].update();self.buttons[i].enabled=false;self.buttons[i].text="";}
   for(var i=0;i<grid.length;i++){self.status.text="Rendering candidate "+(i+1)+" / "+grid.length+"...";processEvents();var img=null;
    try{var renderStarted=new Date().getTime(),recipeKey=JSON.stringify(grid[i]),cached=null;
     for(var ci=0;ci<self.previewCache.length;ci++)if(self.previewCache[ci].key==recipeKey){cached=self.previewCache[ci];break;}
     if(!cached){img=SSTProcess(self.working,grid[i]);cached={key:recipeKey,bitmap:img.render(),quality:SSTQuality(img,qualitySource),samples:SSTPreviewSamples(img)};self.previewCache.push(cached);if(self.previewCache.length>24)self.previewCache.shift();}
     self.bitmaps.push(cached.bitmap);qualities.push(SSTCopy(cached.quality));console.writeln("[SST timing] Candidate "+(i+1)+": "+((new Date().getTime()-renderStarted)/1000).toFixed(3)+" s"+(img?" render + quality":" cached"));if(self.session.stage=="complete"&&grid[i].id==self.session.finalWinner.id&&(!self.session.winnerInfo||self.session.winnerInfo.recipeId!=grid[i].id)){if(!img)img=SSTProcess(self.working,grid[i]);self.session.winnerInfo={recipeId:grid[i].id,sourceFingerprint:self.session.fingerprint,measurement:SSTDescribe(img,"final winning working preview",120000)};self.dirty=true;}
     if(self.session.stage=="refine"&&self.session.refineAlgorithm>=2)previewSamples.push(cached.samples);}finally{if(img)img.free();}
    self.tiles[i].bitmap=self.bitmaps[i];self.tiles[i].selected=false;self.tiles[i].update();
    self.buttons[i].enabled=true;
   }
   var similar=self.session.stage=="refine"&&self.session.refineAlgorithm>=2?SSTSimilarPairs(previewSamples):0;
   var key=self.session.branch+":"+self.session.refineStep,width=self.session.refineWidths?self.session.refineWidths[key]||0:0;
   if(similar>=4&&width<2&&self.session.refineAlgorithm>=2&&(self.session.refineAlgorithm<4||self.session.refineAlgorithm==5)){
    var parent=SSTRefineParent(self.session);self.session.refineWidths[key]=width+1;self.session.refineGrid=SSTRefineGrid(self.session,parent);self.dirty=true;
    self.status.text="Near-duplicate previews detected. Widening refinement range...";processEvents();self.busy=false;self.showGrid();return;
   }
   SSTApplyPreferences(SSTOptional(self.session,"preferenceModel",null),qualities);
   var ranking=[];for(i=0;i<qualities.length;i++)ranking.push(i);ranking.sort(function(a,b){return SSTQualityOrder(qualities[a],qualities[b])||a-b;});
   self.labelGrid=grid;self.labelQualities=qualities;self.labelRanking=ranking;self.refreshLabels();
   self.session.qualityRatings=self.session.qualityRatings||{};self.session.qualityRatings[grid.map(function(p){return p.id;}).join("|")]=qualities;self.dirty=true;
   console.writeln("[SST timing] Grid total: "+((new Date().getTime()-gridStarted)/1000).toFixed(3)+" s");self.gridReady=true;var st=self.session.stage;
   self.status.text=st=="round"?SSTPhase(self.session)+" — choose one.":st=="shortlist"?"Select 1-3 finalists to refine. Click again to deselect.":st=="blend"?"Top: A, B, C. Middle: AB, AC, BC. Bottom: blends weighted toward A, B, C. Select 1-3 to refine.":st=="refine"?"Refinement branch "+(self.session.branch+1)+" / "+self.session.shortlist.length+", grid "+(self.session.refineStep+1)+" / 3 — choose one. Parent retained.":st=="playoff"?"Final comparison — choose the best of "+grid.length+" refined winners.":st=="compare"?"One last choice: your favorite versus the trainer favorite. Choose which opens in Quick Stretch.":st=="final"?"Legacy tournament final — choose one.":"Complete: winner "+self.session.finalWinner.id+". Save preferences and create output.";
   if(st=="compare"&&SSTRegionDifference(SSTPreviewSamplesForRecipe(self.working,grid[0]),SSTPreviewSamplesForRecipe(self.working,grid[1]),self.working.numberOfChannels)<.008)self.status.text+=" The two results are very similar.";
   if(st=="refine"&&self.session.refineAlgorithm>=2){self.status.text+=" Range "+(width+1)+"/3.";if(similar>=4)self.status.text+=" Some choices remain similar; keep the parent if appropriate.";}
   if(!grid.length)self.status.text="All initial rounds were skipped. No finalists were accepted. Save this feedback or start a new session.";
   if(qualities.length&&qualities.every(function(q){return SSTOptional(q,"learnedAcceptance","unknown")=="rejected";}))self.status.text="No acceptable candidates in this grid based on your training. Use None acceptable to skip this round.";
   if(self.session.stage=="complete"){for(i=0;i<grid.length;i++)if(grid[i].id==self.session.finalWinner.id)self.selected=i;if(self.selected>=0){self.tiles[self.selected].selected=true;self.tiles[self.selected].update();}}
  }finally{self.busy=false;self.refreshActions();}
 };
 this.start.onClick=function(){if(self.busy||!self.confirmUnsaved())return;var view=self.views.currentView;if(view.isNull){SSTError("Select a main image.");return;}
  var snap=null,work=null;self.busy=true;self.refreshActions();self.status.text="Analyzing source image...";processEvents();
  try{if(view.image.sampleType!=SampleType_Real)throw new Error("Convert the linear source to 32-bit or 64-bit floating point before training.");snap=new Image(view.image);snap.resetSelections();if(snap.numberOfChannels!=1&&snap.numberOfChannels!=3)throw new Error("Use grayscale or RGB without alpha channels.");
   var fingerprint=SSTFingerprint(snap);work=new Image(snap);work.resetSelections();var scale=Math.min(1,600/work.width,400/work.height);if(scale<1)work.resample(scale);
   self.status.text="Measuring image and selecting stretch strategies...";processEvents();
   var stats=SSTMeasure(work),target=SST_TARGETS[self.target.currentItem],session=null,isNewSession=false,palette=SST_PALETTES[self.palette.currentItem];
   if(stats.luminance.median>=.12){var yes=new MessageBox("This source may already be stretched. Train only from linear data for useful comparisons. Continue?","Smart Stretch Trainer",StdIcon_Question,StdButton_Yes,StdButton_No).execute();if(yes!=StdButton_Yes){work.free();snap.free();return;}}
   for(var j=self.dataset.sessions.length-1;j>=0;j--){var s=self.dataset.sessions[j];if(s.stage!="complete"&&s.fingerprint==fingerprint&&s.target==target&&SSTOptional(s,"palette","Broadband RGB")==palette){if(new MessageBox("Resume the saved tournament for this source and target type?","Smart Stretch Trainer",StdIcon_Question,StdButton_Yes,StdButton_No).execute()==StdButton_Yes)session=s;break;}}
   var check=SSTOptional(self.gradientChecked,fingerprint,null);
   if(!check){
    self.status.text="Checking linear background for gradients...";processEvents();
    try{check=SSTGradientTools(work,null);}catch(checkError){check={detected:false,status:"inconclusive",reason:String(checkError)};console.warningln("[Trainer gradient check] "+checkError);}
    self.gradientChecked[fingerprint]=check;
   }
   self.gradientResult.text=check.status=="detected"?"Gradient detected: "+check.reason:check.status=="clear"?"No significant gradient detected":"Gradient check inconclusive: "+check.reason;
   console.writeln("[Trainer gradient check] "+JSON.stringify(check));
   if(check.detected){var correct=new MessageBox("Possible background gradient detected. Open SmartGradientCorrection?\n\n"+check.reason+".\nYes: open correction and pause training. After creating an output, select the corrected image and click Start / resume.\nNo: continue training.","Smart Stretch Trainer",StdIcon_Question,StdButton_Yes,StdButton_No).execute();
    if(correct==StdButton_Yes){work.free();snap.free();work=null;snap=null;SSTGradientTools(null,view);self.views.getMainViews();self.views.currentView=view;self.status.text="Select your corrected image, then click Start / resume.";return;}
   }
   var preferenceModel=SSTBuildPreferenceModel(self.dataset,target,stats,{dataKind:SST_DATA_KINDS[self.dataKind.currentItem],starContent:SST_STAR_KINDS[self.starKind.currentItem],palette:palette});
   if(!session){var seed=(new Date().getTime()%4294967296)>>>0;session={flow:2,comparisonEnabled:true,automaticMode:"on-choice",blendFinalists:true,refineAlgorithm:6,comparisonSkipIdentical:true,refineWidths:{},id:"SST-"+new Date().getTime()+"-"+seed,version:SST_VERSION,source:view.fullId,label:self.label.text,palette:palette,target:target,fingerprint:fingerprint,sourceWidth:snap.width,sourceHeight:snap.height,bitsPerSample:snap.bitsPerSample,stats:stats,seed:seed,preferenceModel:preferenceModel,candidates:SSTCandidates(stats,seed,work,target,preferenceModel,palette),stage:"round",round:0,winners:[],choices:[],finalWinner:null,started:new Date().toISOString()};SSTInitial(session);isNewSession=true;}
   session.gradientCheck=JSON.parse(JSON.stringify(check));
   if(!session.linearInfo){self.status.text="Measuring original linear image...";processEvents();session.linearInfo=SSTDescribe(snap,"original linear source",200000,function(f){self.status.text="Linear image measurements: "+Math.floor(f*100)+"%";processEvents();});session.measurementsUpdated=new Date().toISOString();self.dirty=true;}
   if(session.comparisonEnabled&&!session.autoPath){session.autoPath=SSTNewAutomaticPath(session);self.dirty=true;}
   if(!session.dataLabels){session.dataLabels={dataKind:SST_DATA_KINDS[self.dataKind.currentItem],starContent:SST_STAR_KINDS[self.starKind.currentItem]};self.dirty=true;}
   self.dataKind.currentItem=SST_DATA_KINDS.indexOf(session.dataLabels.dataKind);self.starKind.currentItem=SST_STAR_KINDS.indexOf(session.dataLabels.starContent);self.palette.currentItem=SST_PALETTES.indexOf(SSTOptional(session,"palette","Broadband RGB"));
   if(isNewSession){self.dataset.sessions.push(session);self.dataset.version=SST_VERSION;self.dirty=true;}
   if(session.stage=="compare"&&session.autoPath&&SSTSameSettings(session.userFavorite,session.autoPath.finalWinner)){
    session.comparisonSkipIdentical=true;SSTComplete(session,session.userFavorite,session.choices[session.choices.length-1].time);self.dirty=true;}
   self.releaseImages();self.sourceKeywords=view.window.keywords.slice();self.snapshot=snap;self.working=work;snap=null;work=null;self.session=session;self.preferencesLocked=true;SSTQualitySource(self.working).palette=SSTOptional(session,"palette","Broadband RGB");self.structure.text=SSTDetectedStructure(SSTQualitySource(self.working));self.notes.text=STHoverCaption(self.notes,"",0);
  }catch(e){if(snap)snap.free();if(work)work.free();SSTError(e);}finally{self.busy=false;self.refreshActions();}
  if(self.session)try{self.showGrid();}catch(e){SSTError(e);}
 };
 this.blind.onCheck=function(){if(self.session&&!self.busy)self.refreshLabels();};
 this.reject.onClick=function(){if(self.busy||!self.session||!self.gridReady)return;
  try{var next=SSTCopy(self.session),a=SSTOptional(next,"autoPath",null);
   if(a){var offered=SSTGrid(a).map(function(p){return p.id;});SSTSkip(a,"User skipped this round: none acceptable");a.ratings.push({stage:self.session.stage,offered:offered,quality:[],selected:[],skipped:true});}
   SSTSkip(next,self.notes.text);self.session=next;
   for(var si=0;si<self.dataset.sessions.length;si++)if(self.dataset.sessions[si].id==next.id){self.dataset.sessions[si]=next;break;}
   self.dirty=true;self.selected=-1;self.multiSelected=[];self.notes.text=STHoverCaption(self.notes,"",0);self.showGrid();
  }catch(e){SSTError(e);}};
 this.pick.onClick=function(){if(self.busy)return;try{var priorAuto=self.session.autoPath,nextAuto=priorAuto;
 if(self.session.automaticMode=="on-choice"&&self.session.stage!="compare"){
  self.busy=true;self.refreshActions();try{nextAuto=SSTAutomaticStep(self.session,self.working,self.multiSelected.length,function(n){self.status.text="Choosing trainer recommendation for this round: render "+n;processEvents();});}finally{self.busy=false;self.refreshActions();}
 }
 self.session.autoPath=nextAuto;try{SSTChoose(self.session,self.selected,self.notes.text,self.multiSelected.slice());}catch(choiceError){self.session.autoPath=priorAuto;throw choiceError;}self.dirty=true;self.notes.text=STHoverCaption(self.notes,"",0);if(self.session.stage=="complete"){
  try{SSTCaptureComparison(self.session,self.working);}catch(previewError){SSTError("Choice saved, but comparison image embedding failed: "+previewError);}}
 if(self.session.stage=="complete")self.session.explanation=SSTExplain(self.session);self.showGrid();if(self.session.stage=="complete"){self.session.explanation=SSTExplain(self.session);self.openWinnerQuick();}}catch(e){SSTError(e);}};
 this.restartRefine.onClick=function(){
  if(self.busy||!self.session||self.session.flow!=2||self.session.round!=9)return;
  try{var copy=SSTCopy(self.session),events=SSTCopy(copy.choices.slice(0,9));copy.id="SST-refine-"+new Date().getTime();copy.version=SST_VERSION;copy.blendFinalists=true;copy.refineAlgorithm=6;copy.comparisonSkipIdentical=true;copy.refineWidths={};copy.restartedFrom=self.session.id;copy.started=new Date().toISOString();SSTReplay(copy,events);if(copy.automaticMode=="on-choice"&&copy.autoPath){var ae=SSTCopy(copy.autoPath.choices.slice(0,9));copy.autoPath.blendFinalists=true;copy.autoPath.refineAlgorithm=6;copy.autoPath.refineWidths={};SSTReplay(copy.autoPath,ae);copy.autoPath.ratings=copy.autoPath.ratings.slice(0,9);}self.dataset.sessions.push(copy);self.session=copy;self.dirty=true;self.notes.text=STHoverCaption(self.notes,"",0);self.showGrid();}catch(e){SSTError(e);}
 };
 this.explain.onClick=function(){
  if(self.busy||!self.session||self.session.stage!="complete")return;
  try{var text=SSTExplain(self.session),d=new Dialog;d.windowTitle="What you picked";
   var report=new TextBox(d);report.readOnly=true;report.text=text;report.setMinSize(760,520);
   var close=new PushButton(d);close.text=STHoverCaption(close,"Close",0);close.onClick=function(){d.ok();};
   d._stBody=new VerticalSizer;d._stBody.margin=10;d._stBody.spacing=8;d._stBody.add(report,100);d._stBody.add(close);d._stFooter=close;STScreenFit.adjust(d);console.writeln(text);STScreenFit.execute(d);
  }catch(e){SSTError(e);}
 };
 this.inspect.onClick=function(){
  if(self.selected<0||self.busy||!self.gridReady||!self.snapshot)return;
  var index=self.selected,source=null,img=null,d=null,tile=null;
  self.busy=true;self.refreshActions();
  try{
   var inspectStarted=new Date().getTime(),recipeKey=JSON.stringify(SSTGrid(self.session)[index]),cached=null;
   for(var ci=0;ci<self.inspectCache.length;ci++)if(self.inspectCache[ci].key==recipeKey){cached=self.inspectCache[ci];break;}
   if(!cached){self.status.text="Rendering enlarged preview...";processEvents();
    if(!self.inspectSource){self.inspectSource=new Image(self.snapshot);self.inspectSource.resetSelections();var scale=Math.min(1,1200/self.inspectSource.width,800/self.inspectSource.height);if(scale<1)self.inspectSource.resample(scale);}
    img=SSTProcess(self.inspectSource,SSTGrid(self.session)[index]);cached={key:recipeKey,bitmap:img.render()};self.inspectCache.push(cached);if(self.inspectCache.length>6)self.inspectCache.shift();
   }
   console.writeln("[SST timing] Enlarged preview: "+((new Date().getTime()-inspectStarted)/1000).toFixed(3)+" s"+(img?" rendered":" cached"));
   d=new Dialog;d.windowTitle=self.session.stage=="complete"?"Final selection — enlarged detail preview":"Candidate "+(index+1)+" — enlarged detail preview";
   tile=SSTCanvas(d,1200,800);tile.bitmap=cached.bitmap;
   var close=new PushButton(d);close.text=STHoverCaption(close,"Close",0);close.onClick=function(){d.ok();};
   d._stBody=new VerticalSizer;d._stBody.margin=8;d._stBody.spacing=6;d._stBody.add(tile);d._stBody.add(close);d._stFooter=close;STScreenFit.adjust(d);STScreenFit.execute(d);
  }catch(e){SSTError(e);}finally{if(tile)tile.bitmap=null;if(img)img.free();if(source)source.free();self.busy=false;self.refreshActions();}
 };
 this.output.onClick=function(){if(self.busy||self.selected<0)return;self.busy=true;self.refreshActions();var img=null,w=null,busy=null;self.lastOutputView=null;
  function report(value,stage){busy.setProgress(value,stage);self.status.text="Native-size copy: "+Math.floor(value)+"% — "+stage;processEvents();}
  try{var p=SSTGrid(self.session)[self.selected],outputKeywords=null;
   busy=new SmartStretchBusyDialog(self);busy.windowTitle="Smart Stretch Trainer — Creating native image";
   busy.message_Label.text="<b>Creating native-size image…</b><br/>Applying the selected recipe to the full-resolution source. Please wait…";
   busy.onClose=function(){return false;};STScreenFit.adjust(busy);STScreenFit.show(busy);report(0,"Preparing full-resolution image…");
   report(1,"Preparing compact FITS metadata…");
   try{outputKeywords=SSTOutputKeywords(self.sourceKeywords,self.session,p,new Date().toISOString());console.writeln("[SST output] Prepared "+outputKeywords.length+" FITS cards before rendering.");}
   catch(metadataError){console.warningln("[SST output] Metadata omitted: "+metadataError);}
   img=SSTProcess(self.snapshot,p,function(f,stage){report(2+93*f,stage);});
   report(96,"Creating output window…");
   w=new ImageWindow(img.width,img.height,img.numberOfChannels,self.snapshot.bitsPerSample==64?64:32,true,img.numberOfChannels==3,"SST_"+p.id);
   report(98,"Copying full-resolution result…");
   w.mainView.beginProcess(UndoFlag_NoSwapFile);try{w.mainView.image.assign(img);}finally{w.mainView.endProcess();}
   report(99,"Recording stretch settings in FITS header…");
   if(outputKeywords){var headerStarted=new Date().getTime();console.writeln("[SST output] BEGIN header assignment: "+outputKeywords.length+" cards");
    try{w.keywords=outputKeywords;}catch(headerError){console.warningln("[SST output] Header assignment failed; retaining image: "+headerError);}
    console.writeln("[SST output] END header assignment: "+((new Date().getTime()-headerStarted)/1000).toFixed(3)+" s");}
   report(99.5,"Displaying output window…");console.writeln("[SST output] BEGIN window display");
   w.show();console.writeln("[SST output] END window display");self.lastOutputView=w.mainView;console.writeln("[SST] Output recipe: "+JSON.stringify(p));report(100,"Native image created");self.status.text="Created "+w.mainView.fullId+" from frozen source. Original unchanged.";w=null;
  }catch(e){if(w)w.forceClose();if(busy)busy.hide();SSTError(e);}finally{if(busy)busy.hide();if(img)img.free();self.busy=false;self.refreshActions();}
 };
 this.openWinnerQuick=function(){
  if(!self.session||self.session.stage!="complete")return;
  self.output.onClick();
  if(!self.lastOutputView)return;
  var d=null;try{self.lastOutputView.window.bringToFront();d=new SmartStretchDialog(true);d.windowTitle="Smart Stretch — Trainer winner";d.applyBasicStretchPreview();STScreenFit.execute(d);}
  catch(e){SSTError("Winner image was created, but Quick Stretch could not open: "+e);}
  finally{if(d)SmartStretchCleanup(d);}
 };
 this.load.onClick=function(){if(self.busy||self.preferencesLocked||!self.confirmUnsaved())return;var d=new OpenFileDialog;d.caption="Load trainer preferences";d.multipleSelections=false;d.filters=[["Trainer JSON",".json"]];if(!STScreenFit.execute(d))return;
  try{var imported=SSTValidateDataset(JSON.parse(File.readTextFile(d.fileName)));self.releaseImages();self.session=null;self.structure.text="Detected structure: Not analyzed — select a linear image and click Start / resume";self.gridReady=false;self.dataset=imported;self.selected=-1;self.savePath=d.fileName;self.dirty=false;for(var i=0;i<9;i++){self.tiles[i].update();self.buttons[i].enabled=false;}self.status.text="Loaded "+imported.sessions.length+" sessions. Start a new session to use completed preferences; resumed sessions retain their saved ranking model.";self.refreshActions();}catch(e){SSTError(e);}
 };
 this.submit.onClick=function(){
  if(self.busy)return;
  var completed=self.dataset.sessions.filter(function(s){return s.stage=="complete";});if(!completed.length)return;
  var d=new SaveFileDialog;d.caption="Export completed training sessions for Don";d.filters=[["Trainer JSON",".json"]];d.initialPath="SmartStretchTraining-"+new Date().getTime()+"-"+Math.floor(Math.random()*1000000)+".json";
  if(!STScreenFit.execute(d))return;
  try{
   if(self.savePath&&d.fileName==self.savePath)throw new Error("Choose a different filename from your progress file.");
   if(File.exists(d.fileName))throw new Error("Choose a new filename for this export to preserve the existing file.");
   var exported={schema:"smart-stretch-trainer-1",version:SST_VERSION,sessions:SSTCopy(completed)};
   var text=JSON.stringify(exported,null,2);File.writeTextFile(d.fileName,text);if(File.readTextFile(d.fileName)!=text)throw new Error("Export verification failed.");
   var opened=false;try{opened=SSTOpenUploadPage();}catch(e){console.warningln("Browser launch failed: "+String(e));}
   var help=new Dialog;help.windowTitle="Upload training data to Don";
   var instructions=new TextBox(help);instructions.readOnly=true;instructions.setMinSize(650,300);instructions.text="Exported "+completed.length+" completed session(s).\n\nFile: "+d.fileName+"\n\n"+(opened?"The Dropbox page has been requested in your browser.":"Open the link below in your browser.")+"\nSelect this JSON file on the Dropbox page, then click Upload.\n\n"+SST_UPLOAD_URL+"\n\nThe JSON includes image measurements, stretch settings, choice history, dataset labels, notes and source names. It includes embedded comparison previews when you choose your favorite over a different trainer favorite. These are reduced 8-bit images, not full-resolution linear data.\n\nThe trainer cannot confirm whether the browser upload succeeds. Your progress still needs to be saved separately.";
   var done=new PushButton(help);done.text=STHoverCaption(done,"Close",0);done.onClick=function(){help.ok();};help._stBody=new VerticalSizer;help._stBody.margin=8;help._stBody.spacing=6;help._stBody.add(instructions);help._stBody.add(done);help._stFooter=done;STScreenFit.adjust(help);STScreenFit.execute(help);
   self.status.text="Training JSON exported. Finish the upload in your browser.";
  }catch(e){SSTError(e);}
 };
 this.save.onClick=function(){self.saveData();};this.closeButton.onClick=function(){if(self.confirmUnsaved()){self.closingConfirmed=true;self.ok();}};
 this.onClose=function(){return !self.busy&&(self.closingConfirmed||self.confirmUnsaved());};this.refreshActions();STScreenFit.adjust(this);
}
SSTTrainerDialog.prototype=new Dialog;
function SSTMain(){var d=new SSTTrainerDialog;try{STScreenFit.execute(d);}finally{d.releaseImages();}}
SSTMain();
