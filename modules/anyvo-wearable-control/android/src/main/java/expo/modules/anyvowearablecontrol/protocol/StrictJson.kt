package expo.modules.anyvowearablecontrol.protocol

import org.json.JSONTokener

/** Android's JSONTokener accepts non-JSON syntax; validate RFC JSON before using it. */
internal class StrictJson(private val input: String) {
  private var pos = 0
  fun validate() { value(0); whitespace(); require(pos == input.length) }
  private fun whitespace() { while (pos < input.length && input[pos] in " \t\n\r") pos++ }
  private fun take(char: Char): Boolean { whitespace(); return if (pos < input.length && input[pos] == char) { pos++; true } else false }
  private fun string(): String {
    whitespace(); val start = pos
    require(pos < input.length && input[pos++] == '"')
    while (pos < input.length) {
      val c = input[pos++]
      require(c >= ' ')
      if (c == '"') return JSONTokener(input.substring(start, pos)).nextValue() as String
      if (c == '\\') {
        require(pos < input.length)
        when (input[pos++]) {
          '"', '\\', '/', 'b', 'f', 'n', 'r', 't' -> Unit
          'u' -> { repeat(4) { require(pos < input.length && input[pos++] in "0123456789abcdefABCDEF") } }
          else -> error("invalid escape")
        }
      }
    }
    error("unterminated string")
  }
  private fun value(depth: Int) {
    require(depth < 16); whitespace(); require(pos < input.length)
    when (input[pos]) {
      '{' -> {
        pos++; val keys = hashSetOf<String>()
        if (take('}')) return
        do { require(keys.add(string())); require(take(':')); value(depth + 1) } while (take(','))
        require(take('}'))
      }
      '[' -> { pos++; if (take(']')) return; do { value(depth + 1) } while (take(',')); require(take(']')) }
      '"' -> string()
      't' -> literal("true")
      'f' -> literal("false")
      'n' -> literal("null")
      else -> {
        val match = NUMBER.find(input, pos) ?: error("invalid number")
        require(match.range.first == pos); pos = match.range.last + 1
      }
    }
  }
  private fun literal(text: String) { require(input.startsWith(text, pos)); pos += text.length }
  companion object { private val NUMBER = Regex("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?") }
}
