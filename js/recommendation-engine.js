// MojoBoost — recommendation-engine.js
// Rule-based mod recommendation system

const RecommendationEngine = (() => {

  function parseRAM(ramStr) {
    if (!ramStr) return 4;
    const n = parseInt(ramStr);
    return isNaN(n) ? 4 : n;
  }

  function parseArch(archStr) {
    if (!archStr) return "arm64";
    const s = archStr.toLowerCase();
    if (s.includes("arm64") || s.includes("64")) return "arm64";
    if (s.includes("arm32") || s.includes("32")) return "arm32";
    if (s.includes("x86")) return "x86";
    return "arm64";
  }

  function parseAndroid(ver) {
    const n = parseInt(ver);
    return isNaN(n) ? 12 : n;
  }

  function parseVersion(ver) {
    if (!ver) return "1.20";
    return ver.replace("MC ", "").trim();
  }

  // Core recommendation logic
  function recommend(config) {
    const {
      mcVersion,
      modLoader,
      launcher,
      androidVersion,
      ram,
      cpuArch,
      gpu,
      goal
    } = config;

    const ramGB    = parseRAM(ram);
    const arch     = parseArch(cpuArch);
    const android  = parseAndroid(androidVersion);
    const version  = parseVersion(mcVersion);
    const loader   = modLoader || "Fabric";

    const results = [];
    const notes   = [];
    const warnings= [];

    // ── Launcher-specific notes ──────────────────────────────
    if (launcher === "Mojo Launcher") {
      notes.push({ type: "info", text: "Mojo Launcher has excellent Fabric support. All Fabric mods below are fully compatible." });
    } else if (launcher === "PojavLauncher") {
      notes.push({ type: "info", text: "PojavLauncher works best with Fabric. Some Forge mods may have compatibility issues." });
    } else if (launcher === "Official Launcher") {
      notes.push({ type: "warning", text: "The Official Bedrock launcher doesn't support Fabric/Forge mods. These mods require Java Edition." });
    }

    // ── Low RAM warnings ─────────────────────────────────────
    if (ramGB <= 2) {
      warnings.push({ type: "warning", text: `⚠️ Low RAM (${ramGB} GB) detected. Mods have been filtered for minimal memory use. Keep render distance at 6 or lower.` });
    }

    // ── ARM32 warnings ───────────────────────────────────────
    if (arch === "arm32") {
      warnings.push({ type: "warning", text: "ARM32 device detected. Some mods don't support 32-bit ARM. Incompatible mods have been removed." });
    }

    // ── Old Android warnings ─────────────────────────────────
    if (android < 10) {
      warnings.push({ type: "warning", text: `Android ${android} detected. Make sure your Java version is compatible with your launcher.` });
    }

    // ── Filter and score mods ────────────────────────────────
    MODS_DB.forEach(mod => {
      let score = 0;
      const reasons = [];
      const issues  = [];

      // Must support the mod loader
      if (!mod.loaders.includes(loader)) return;

      // Must support the MC version
      const majorVer = version.split(".").slice(0,2).join(".");
      if (!mod.versions.some(v => v === majorVer || version.startsWith(v))) return;

      // CPU arch compatibility
      if (arch === "arm32" && !mod.compatibility.arm32) return;
      if (arch === "x86"   && !mod.compatibility.x86)   return;

      // Android version minimum
      if (android < mod.minAndroid) return;

      // RAM check — skip heavy mods on low-RAM devices
      if (ramGB < mod.minRAM) return;
      if (ramGB <= 2 && mod.memoryMB > 32) return; // skip memory-adding mods on low RAM

      // Base score from performance rating
      score += mod.performanceRating * 0.4;

      // Goal-based scoring
      if (goal === "Maximum FPS") {
        score += mod.fpsGain.avg * 0.5;
        if (mod.category === "rendering") { score += 20; reasons.push("Rendering optimizer"); }
        if (mod.category === "memory")    { score += 15; reasons.push("Frees memory for FPS"); }
        if (mod.category === "logic")     { score += 12; reasons.push("Reduces CPU overhead"); }
        if (mod.memoryMB < 0)             { score += 10; }
      } else if (goal === "Balanced") {
        score += mod.fpsGain.avg * 0.3;
        if (mod.category === "rendering") { score += 15; }
        if (mod.category === "memory")    { score += 15; }
        if (mod.category === "battery")   { score += 10; }
        if (mod.memoryMB < 0)             { score += 8; }
      } else if (goal === "Best Graphics") {
        if (mod.goals.includes("Best Graphics")) { score += 25; }
        if (mod.category === "rendering")        { score += 20; reasons.push("Improves visual quality"); }
        if (mod.id === "enhancedblockentities")  { score += 15; }
        if (mod.id === "immediatelyfast")         { score += 12; }
      } else if (goal === "Battery Saver") {
        score += mod.fpsGain.avg * 0.1;
        if (mod.category === "battery")  { score += 30; reasons.push("Reduces power consumption"); }
        if (mod.category === "memory")   { score += 20; reasons.push("Frees RAM = less heat"); }
        if (mod.memoryMB < 0)            { score += 15; }
        if (!mod.goals.includes("Battery Saver") && mod.category !== "memory") {
          score -= 10;
        }
      }

      // GPU-specific bonuses
      if (gpu === "Adreno" && mod.id === "sodium") {
        score += 10; reasons.push("Excellent Adreno GPU support");
      }
      if (gpu === "Mali" && mod.id === "sodium") {
        score += 8; reasons.push("Good Mali GPU support");
      }

      // Low RAM device bonuses
      if (ramGB <= 2) {
        if (mod.memoryMB < -100) { score += 20; reasons.push("Critical for low-RAM device"); }
        if (mod.id === "ferritecore") { score += 15; }
        if (mod.id === "memoryleakfix") { score += 12; }
      }

      // Featured mods get a small popularity boost
      if (mod.featured) score += 5;

      // Popularity factor
      score += mod.popularity * 0.05;

      // Generate human-readable reason
      if (reasons.length === 0) {
        if (mod.fpsGain.avg > 30) reasons.push(`+${mod.fpsGain.avg} FPS average gain`);
        else if (mod.memoryMB < 0) reasons.push(`Saves ~${Math.abs(mod.memoryMB)} MB RAM`);
        else reasons.push("General performance improvement");
      }

      results.push({
        mod,
        score: Math.round(score),
        reasons,
        issues,
        priority: score > 80 ? "essential" : score > 60 ? "recommended" : "optional"
      });
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Classify
    const essential    = results.filter(r => r.priority === "essential");
    const recommended  = results.filter(r => r.priority === "recommended");
    const optional     = results.filter(r => r.priority === "optional");

    // Estimated FPS improvement
    const fpsEstimate = calcFPSEstimate(results.map(r => r.mod), ramGB, arch, goal);

    return {
      essential,
      recommended,
      optional,
      all: results,
      notes,
      warnings,
      fpsEstimate,
      config
    };
  }

  function calcFPSEstimate(mods, ramGB, arch, goal) {
    // Base FPS for typical low-end Android device
    let baseFPS = 15;
    if (ramGB >= 6) baseFPS = 30;
    else if (ramGB >= 4) baseFPS = 22;
    else if (ramGB >= 3) baseFPS = 18;

    // GPU adjustment
    let multiplier = 1.0;

    // Calculate cumulative FPS gain (diminishing returns)
    let totalGain = 0;
    mods.forEach((mod, i) => {
      const gain = mod.fpsGain.avg;
      // Diminishing returns: each subsequent mod contributes less
      const factor = Math.pow(0.75, i);
      totalGain += gain * factor;
    });

    // Goal multiplier
    if (goal === "Maximum FPS") multiplier = 1.2;
    else if (goal === "Battery Saver") multiplier = 0.7;
    else if (goal === "Best Graphics") multiplier = 0.9;

    const afterFPS = Math.round((baseFPS + totalGain) * multiplier);

    return {
      before: baseFPS,
      after: Math.min(afterFPS, 144),
      gain: Math.min(afterFPS, 144) - baseFPS,
      percentage: Math.round(((Math.min(afterFPS, 144) - baseFPS) / baseFPS) * 100)
    };
  }

  // Compatibility check for a single mod + config
  function checkCompat(modId, config) {
    const mod = MODS_DB.find(m => m.id === modId);
    if (!mod) return { compatible: false, reason: "Mod not found" };

    const ramGB  = parseRAM(config.ram);
    const arch   = parseArch(config.cpuArch);
    const android= parseAndroid(config.androidVersion);
    const version= parseVersion(config.mcVersion);
    const loader = config.modLoader || "Fabric";

    if (!mod.loaders.includes(loader))
      return { compatible: false, reason: `Requires ${mod.loaders.join(" or ")}, but you selected ${loader}` };

    const majorVer = version.split(".").slice(0,2).join(".");
    if (!mod.versions.some(v => v === majorVer || version.startsWith(v)))
      return { compatible: false, reason: `Does not support Minecraft ${version}` };

    if (arch === "arm32" && !mod.compatibility.arm32)
      return { compatible: false, reason: "Does not support ARM32 (32-bit) devices" };

    if (arch === "x86" && !mod.compatibility.x86)
      return { compatible: false, reason: "Does not support x86 architecture" };

    if (android < mod.minAndroid)
      return { compatible: false, reason: `Requires Android ${mod.minAndroid}+` };

    if (ramGB < mod.minRAM)
      return { compatible: false, reason: `Requires at least ${mod.minRAM} GB RAM` };

    return { compatible: true, reason: "Fully compatible with your device" };
  }

  return { recommend, checkCompat, calcFPSEstimate };
})();

