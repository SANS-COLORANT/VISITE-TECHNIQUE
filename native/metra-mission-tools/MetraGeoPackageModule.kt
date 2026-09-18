package com.metra.missiontools

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

class MetraGeoPackageModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MetraGeoPackage"

  private fun writeIntLE(out: ByteArrayOutputStream, value: Int) {
    out.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array())
  }

  private fun writeDoubleLE(out: ByteArrayOutputStream, value: Double) {
    out.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(value).array())
  }

  private fun pointCoords(array: JSONArray): DoubleArray =
    doubleArrayOf(array.optDouble(0), array.optDouble(1))

  private fun wkbPoint(coords: JSONArray): ByteArray {
    val out = ByteArrayOutputStream()
    out.write(1)
    writeIntLE(out, 1)
    val p = pointCoords(coords)
    writeDoubleLE(out, p[0])
    writeDoubleLE(out, p[1])
    return out.toByteArray()
  }

  private fun wkbLine(coords: JSONArray): ByteArray {
    val out = ByteArrayOutputStream()
    out.write(1)
    writeIntLE(out, 2)
    writeIntLE(out, coords.length())
    for (i in 0 until coords.length()) {
      val p = pointCoords(coords.getJSONArray(i))
      writeDoubleLE(out, p[0])
      writeDoubleLE(out, p[1])
    }
    return out.toByteArray()
  }

  private fun wkbPolygon(coords: JSONArray): ByteArray {
    val out = ByteArrayOutputStream()
    out.write(1)
    writeIntLE(out, 3)
    writeIntLE(out, coords.length())
    for (ringIndex in 0 until coords.length()) {
      val ring = coords.getJSONArray(ringIndex)
      val points = mutableListOf<DoubleArray>()
      for (i in 0 until ring.length()) points.add(pointCoords(ring.getJSONArray(i)))
      if (points.isNotEmpty()) {
        val first = points.first()
        val last = points.last()
        if (first[0] != last[0] || first[1] != last[1]) points.add(doubleArrayOf(first[0], first[1]))
      }
      writeIntLE(out, points.size)
      points.forEach {
        writeDoubleLE(out, it[0])
        writeDoubleLE(out, it[1])
      }
    }
    return out.toByteArray()
  }

  private fun geometryBlob(geometry: JSONObject): ByteArray? {
    val type = geometry.optString("type")
    val coords = geometry.optJSONArray("coordinates") ?: return null
    val wkb = when (type) {
      "Point" -> wkbPoint(coords)
      "LineString" -> wkbLine(coords)
      "Polygon" -> wkbPolygon(coords)
      else -> return null
    }
    val out = ByteArrayOutputStream()
    out.write('G'.code)
    out.write('P'.code)
    out.write(0)
    out.write(1)
    writeIntLE(out, 4326)
    out.write(wkb)
    return out.toByteArray()
  }

  private fun collectBounds(geometry: JSONObject, bounds: DoubleArray) {
    fun add(x: Double, y: Double) {
      if (!x.isFinite() || !y.isFinite()) return
      bounds[0] = kotlin.math.min(bounds[0], x)
      bounds[1] = kotlin.math.min(bounds[1], y)
      bounds[2] = kotlin.math.max(bounds[2], x)
      bounds[3] = kotlin.math.max(bounds[3], y)
    }
    val type = geometry.optString("type")
    val coords = geometry.optJSONArray("coordinates") ?: return
    when (type) {
      "Point" -> add(coords.optDouble(0), coords.optDouble(1))
      "LineString" -> for (i in 0 until coords.length()) {
        val p = coords.optJSONArray(i) ?: continue
        add(p.optDouble(0), p.optDouble(1))
      }
      "Polygon" -> for (r in 0 until coords.length()) {
        val ring = coords.optJSONArray(r) ?: continue
        for (i in 0 until ring.length()) {
          val p = ring.optJSONArray(i) ?: continue
          add(p.optDouble(0), p.optDouble(1))
        }
      }
    }
  }

  @ReactMethod
  fun exportGeoJson(geoJson: String, outputPath: String, promise: Promise) {
    var db: SQLiteDatabase? = null
    try {
      val root = JSONObject(geoJson)
      val features = root.optJSONArray("features") ?: JSONArray()
      val file = File(outputPath.removePrefix("file://"))
      file.parentFile?.mkdirs()
      if (file.exists()) file.delete()
      db = SQLiteDatabase.openOrCreateDatabase(file, null)
      db.execSQL("PRAGMA application_id=1196437808")
      db.execSQL("PRAGMA user_version=10300")
      db.execSQL("CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)")
      db.execSQL("CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER)")
      db.execSQL("CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, PRIMARY KEY (table_name,column_name))")
      db.execSQL("CREATE TABLE features (id INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, properties TEXT)")
      db.execSQL("INSERT INTO gpkg_spatial_ref_sys VALUES('Undefined Cartesian',-1,'NONE',-1,'undefined','undefined Cartesian coordinate reference system')")
      db.execSQL("INSERT INTO gpkg_spatial_ref_sys VALUES('Undefined Geographic',0,'NONE',0,'undefined','undefined geographic coordinate reference system')")
      db.execSQL("INSERT INTO gpkg_spatial_ref_sys VALUES('WGS 84 geodetic',4326,'EPSG',4326,'GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"degree\",0.0174532925199433]]','WGS 84 longitude/latitude')")
      db.execSQL("INSERT INTO gpkg_geometry_columns VALUES('features','geom','GEOMETRY',4326,0,0)")

      val bounds = doubleArrayOf(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY)
      var inserted = 0
      db.beginTransaction()
      try {
        for (i in 0 until features.length()) {
          val feature = features.optJSONObject(i) ?: continue
          val geometry = feature.optJSONObject("geometry") ?: continue
          val blob = geometryBlob(geometry) ?: continue
          collectBounds(geometry, bounds)
          val values = ContentValues()
          values.put("geom", blob)
          values.put("properties", feature.optJSONObject("properties")?.toString() ?: "{}")
          db.insertOrThrow("features", null, values)
          inserted += 1
        }
        val hasBounds = bounds.all { it.isFinite() }
        val sql = if (hasBounds) {
          "INSERT INTO gpkg_contents(table_name,data_type,identifier,description,min_x,min_y,max_x,max_y,srs_id) VALUES(?,?,?,?,?,?,?,?,?)"
        } else {
          "INSERT INTO gpkg_contents(table_name,data_type,identifier,description,srs_id) VALUES(?,?,?,?,?)"
        }
        val args: Array<Any> = if (hasBounds) {
          arrayOf("features","features","METRA Mission","Export METRA",bounds[0],bounds[1],bounds[2],bounds[3],4326)
        } else {
          arrayOf("features","features","METRA Mission","Export METRA",4326)
        }
        db.execSQL(sql, args)
        db.setTransactionSuccessful()
      } finally {
        db.endTransaction()
      }
      db.close()
      db = null

      val payload = Arguments.createMap()
      payload.putString("uri", Uri.fromFile(file).toString())
      payload.putInt("featureCount", inserted)
      promise.resolve(payload)
    } catch (error: Exception) {
      try { db?.close() } catch (_: Exception) {}
      promise.reject("METRA_GPKG_ERROR", error.message, error)
    }
  }
}
