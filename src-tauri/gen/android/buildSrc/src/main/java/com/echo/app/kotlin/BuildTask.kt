import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = System.getenv("NODE")
            ?: System.getenv("NODE_BINARY")
            ?: "node"
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )
                
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        // Monorepo: Rust crate lives under `src-tauri/`; CLI is hoisted to repo-root `node_modules`.
        // Do not run `node tauri ...` — Node treats `tauri` as a path to a missing script.
        val tauriProjectRoot = File(project.projectDir, rootDirRel).canonicalFile
        val cliJs =
            File(tauriProjectRoot, "../node_modules/@tauri-apps/cli/tauri.js").canonicalFile
        if (!cliJs.isFile) {
            throw GradleException(
                "Tauri CLI not found at ${cliJs.path} (run `npm ci` from the monorepo root).",
            )
        }
        val args = mutableListOf(cliJs.absolutePath, "android", "android-studio-script")

        project.exec {
            workingDir(tauriProjectRoot)
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}