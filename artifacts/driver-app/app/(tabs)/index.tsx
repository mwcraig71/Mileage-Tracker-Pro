import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useGetGpsDevices,
  useListProjects,
  useListTeamLeaders,
  useListDriverSessions,
  useStartDriverSession,
  useEndDriverSession,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;
type Insets = { top: number; bottom: number; left: number; right: number };
type ModalType = "date" | "driver" | "truck" | "project" | null;

type DateOption = { value: string; label: string };

function recentDates(count = 14): DateOption[] {
  const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const result: DateOption[] = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let label: string;
    if (i === 0)      label = `Today — ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    else if (i === 1) label = `Yesterday — ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    else              label = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    result.push({ value, label });
  }
  return result;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function fmtDate(d: Date) {
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fmtSessionTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ShiftScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [modalType, setModalType] = useState<ModalType>(null);
  const dateOptions = useMemo(() => recentDates(14), []);
  const [now, setNow] = useState<Date>(new Date());
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const { data: devices = [], isLoading: devicesLoading } = useGetGpsDevices();
  const { data: projects = [], isLoading: projectsLoading } = useListProjects();
  const { data: teamLeaders = [], isLoading: leadersLoading } = useListTeamLeaders();

  const {
    data: dateSessions = [],
    refetch: refetchSessions,
  } = useListDriverSessions({ from: selectedDate, to: selectedDate });

  useEffect(() => {
    const t = setInterval(() => { refetchSessions(); }, 30000);
    return () => clearInterval(t);
  }, [refetchSessions]);

  const startMut = useStartDriverSession();
  const endMut = useEndDriverSession();

  const selectedDevice = devices.find((d) => d.device_id === selectedDeviceId);
  const isLoading = devicesLoading || projectsLoading || leadersLoading;
  const isReady = !!selectedDriver && !!selectedDeviceId;

  const activeSession = useMemo(() => {
    if (!selectedDriver || !selectedDeviceId) return null;
    return (
      dateSessions.find(
        (s) =>
          s.driver_name === selectedDriver &&
          s.device_id === selectedDeviceId &&
          !s.ended_at,
      ) ?? null
    );
  }, [dateSessions, selectedDriver, selectedDeviceId]);

  const selectedDateLabel = useMemo(
    () => dateOptions.find((o) => o.value === selectedDate)?.label ?? selectedDate,
    [dateOptions, selectedDate],
  );

  const pickerData = useMemo<string[]>(() => {
    if (modalType === "date")    return dateOptions.map((o) => o.label);
    if (modalType === "driver")  return teamLeaders.map((t) => t.name);
    if (modalType === "truck")   return devices.map((d) => d.display_name);
    if (modalType === "project") return ["", ...projects.map((p) => p.project_number)];
    return [];
  }, [modalType, dateOptions, teamLeaders, devices, projects]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg("");
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg("");
  };

  const handlePickerSelect = (value: string) => {
    if (modalType === "date") {
      const opt = dateOptions.find((o) => o.label === value);
      if (opt) setSelectedDate(opt.value);
    } else if (modalType === "driver") {
      setSelectedDriver(value);
    } else if (modalType === "truck") {
      const dev = devices.find((d) => d.display_name === value);
      setSelectedDeviceId(dev?.device_id ?? "");
    } else if (modalType === "project") {
      setSelectedProject(value);
    }
    setModalType(null);
  };

  const handleStartShift = async () => {
    if (!isReady) return;
    setErrorMsg("");
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await startMut.mutateAsync({
        data: {
          driver_name: selectedDriver,
          device_id: selectedDeviceId,
          project_number: selectedProject || "",
          shift_date: selectedDate,
        },
      });
      await refetchSessions();
      showSuccess("Shift started!");
    } catch {
      showError("Failed to start shift. Check connection and try again.");
    }
  };

  const handleEndShift = async () => {
    if (!activeSession) return;
    setErrorMsg("");
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await endMut.mutateAsync({ id: activeSession.id });
      await refetchSessions();
      showSuccess("Shift ended.");
    } catch {
      showError("Failed to end shift. Try again.");
    }
  };

  const s = makeStyles(colors, insets);

  return (
    <View style={s.root}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerIcon}>
            <Feather name="truck" size={20} color={colors.primary} />
          </View>
          <Text style={s.headerTitle}>Shift Log</Text>
        </View>

        {/* Clock */}
        <View style={s.clockCard}>
          <Text style={s.clockTime}>{fmtTime(now)}</Text>
          <Text style={s.clockDate}>{fmtDate(now)}</Text>
        </View>

        {/* Active session banner */}
        {activeSession ? (
          <View style={s.activeBanner}>
            <View style={s.activeBannerRow}>
              <View style={s.activeDot} />
              <Text style={s.activeLabel}>SHIFT ACTIVE</Text>
            </View>
            <Text style={s.activeName}>{activeSession.driver_name}</Text>
            <Text style={s.activeMeta}>
              {selectedDevice?.display_name ?? activeSession.device_id}
              {activeSession.project_number ? ` · ${activeSession.project_number}` : ""}
            </Text>
            <Text style={s.activeTime}>Since {fmtSessionTime(activeSession.started_at)}</Text>
          </View>
        ) : null}

        {/* Selectors */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>SHIFT DETAILS</Text>

          {/* Date */}
          <TouchableOpacity
            style={[s.selectorCard, selectedDate !== todayStr() && s.selectorCardBackdate]}
            onPress={() => setModalType("date")}
            activeOpacity={0.75}
            testID="select-date"
          >
            <View style={[s.selectorIconBox, selectedDate !== todayStr() && s.selectorIconBoxBackdate]}>
              <Feather
                name="calendar"
                size={18}
                color={selectedDate !== todayStr() ? "#F59E0B" : colors.mutedForeground}
              />
            </View>
            <View style={s.selectorText}>
              <Text style={s.selectorHint}>Date</Text>
              <Text style={[s.selectorVal, selectedDate !== todayStr() && s.selectorValBackdate]}>
                {selectedDateLabel}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <TouchableOpacity
                style={[s.selectorCard, !!selectedDriver && s.selectorCardActive]}
                onPress={() => setModalType("driver")}
                activeOpacity={0.75}
                testID="select-driver"
              >
                <View style={[s.selectorIconBox, !!selectedDriver && s.selectorIconBoxActive]}>
                  <Feather
                    name="user"
                    size={18}
                    color={selectedDriver ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <View style={s.selectorText}>
                  <Text style={s.selectorHint}>Driver</Text>
                  <Text style={[s.selectorVal, !selectedDriver && s.selectorValEmpty]}>
                    {selectedDriver || "Select driver…"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.selectorCard, !!selectedDeviceId && s.selectorCardActive]}
                onPress={() => setModalType("truck")}
                activeOpacity={0.75}
                testID="select-truck"
              >
                <View style={[s.selectorIconBox, !!selectedDeviceId && s.selectorIconBoxActive]}>
                  <Feather
                    name="truck"
                    size={18}
                    color={selectedDeviceId ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <View style={s.selectorText}>
                  <Text style={s.selectorHint}>Truck</Text>
                  <Text style={[s.selectorVal, !selectedDeviceId && s.selectorValEmpty]}>
                    {selectedDevice?.display_name ?? "Select truck…"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.selectorCard, !!selectedProject && s.selectorCardActive]}
                onPress={() => setModalType("project")}
                activeOpacity={0.75}
                testID="select-project"
              >
                <View style={[s.selectorIconBox, !!selectedProject && s.selectorIconBoxActive]}>
                  <Feather
                    name="briefcase"
                    size={18}
                    color={selectedProject ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <View style={s.selectorText}>
                  <Text style={s.selectorHint}>Project</Text>
                  <Text style={[s.selectorVal, !selectedProject && s.selectorValEmpty]}>
                    {selectedProject || "Optional"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Feedback */}
        {errorMsg ? (
          <View style={s.errorBanner}>
            <Feather name="alert-circle" size={14} color="#EF4444" />
            <Text style={s.errorText}>{errorMsg}</Text>
          </View>
        ) : successMsg ? (
          <View style={s.successBanner}>
            <Feather name="check-circle" size={14} color="#10B981" />
            <Text style={s.successText}>{successMsg}</Text>
          </View>
        ) : null}

        {/* Action button */}
        {activeSession ? (
          <TouchableOpacity
            style={s.endBtn}
            onPress={handleEndShift}
            disabled={endMut.isPending}
            activeOpacity={0.85}
            testID="end-shift-btn"
          >
            {endMut.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="square" size={20} color="#FFFFFF" />
                <Text style={[s.btnText, { color: "#FFFFFF" }]}>End Shift</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.startBtn, !isReady && s.btnDisabled]}
            onPress={handleStartShift}
            disabled={!isReady || startMut.isPending}
            activeOpacity={0.85}
            testID="start-shift-btn"
          >
            {startMut.isPending ? (
              <ActivityIndicator color="#0F1923" />
            ) : (
              <>
                <Feather
                  name="play"
                  size={20}
                  color={isReady ? "#0F1923" : colors.mutedForeground}
                />
                <Text style={[s.btnText, !isReady && s.btnTextDisabled]}>Start Shift</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Sessions for selected date */}
        {dateSessions.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>
              {selectedDate === todayStr() ? "TODAY'S SESSIONS" : selectedDateLabel.toUpperCase()}
            </Text>
            {dateSessions.slice(0, 8).map((sess) => (
              <View key={sess.id} style={s.sessionRow}>
                <View
                  style={[s.sessionDot, sess.ended_at ? s.sessionDotDone : s.sessionDotLive]}
                />
                <View style={s.sessionInfo}>
                  <Text style={s.sessionName}>{sess.driver_name}</Text>
                  <Text style={s.sessionMeta}>
                    {devices.find((d) => d.device_id === sess.device_id)?.display_name ?? sess.device_id}
                    {sess.project_number ? ` · ${sess.project_number}` : ""}
                  </Text>
                </View>
                <Text style={s.sessionTime}>
                  {fmtSessionTime(sess.started_at)}
                  {sess.ended_at ? ` – ${fmtSessionTime(sess.ended_at)}` : " →"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Picker modal */}
      <Modal
        visible={modalType !== null}
        animationType="slide"
        transparent
        presentationStyle="pageSheet"
        onRequestClose={() => setModalType(null)}
      >
        <View style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>
                {modalType === "date"
                  ? "Select Date"
                  : modalType === "driver"
                    ? "Select Driver"
                    : modalType === "truck"
                      ? "Select Truck"
                      : "Select Project"}
              </Text>
              <TouchableOpacity onPress={() => setModalType(null)} style={s.modalCloseBtn}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pickerData}
              keyExtractor={(item, i) => `${item}_${i}`}
              renderItem={({ item }) => {
                let selected = false;
                if (modalType === "driver") selected = item === selectedDriver;
                else if (modalType === "truck")
                  selected = item === (selectedDevice?.display_name ?? "");
                else if (modalType === "project") selected = item === selectedProject;
                return (
                  <TouchableOpacity
                    style={[s.pickerRow, selected && s.pickerRowSelected]}
                    onPress={() => handlePickerSelect(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.pickerText, selected && s.pickerTextSelected]}>
                      {item || "(None)"}
                    </Text>
                    {selected && (
                      <Feather name="check" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: Colors, insets: Insets) {
  const webTop = Platform.OS === "web" ? 67 : 0;
  const webBot = Platform.OS === "web" ? 34 : 0;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    scrollContent: {
      paddingTop: insets.top + webTop + 16,
      paddingBottom: insets.bottom + webBot + 24,
      paddingHorizontal: 20,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: c.foreground,
      letterSpacing: -0.5,
    },

    clockCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingVertical: 24,
      paddingHorizontal: 20,
      alignItems: "center",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    clockTime: {
      fontSize: 52,
      fontFamily: "Inter_700Bold",
      color: c.foreground,
      letterSpacing: -2,
    },
    clockDate: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: c.mutedForeground,
      marginTop: 4,
    },

    activeBanner: {
      backgroundColor: "#0A2B1E",
      borderRadius: 16,
      padding: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#10B98140",
    },
    activeBannerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
    activeLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: "#10B981",
      letterSpacing: 1.5,
    },
    activeName: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: "#F1F5F9",
      marginBottom: 2,
    },
    activeMeta: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: "#86EFAC",
      marginBottom: 4,
    },
    activeTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#4ADE80" + "CC" },

    section: { marginBottom: 16 },
    sectionLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: c.mutedForeground,
      letterSpacing: 1.5,
      marginBottom: 10,
    },

    selectorCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    selectorCardActive: { borderColor: c.primary + "40" },
    selectorCardBackdate: { borderColor: "#F59E0B40" },
    selectorIconBoxBackdate: { backgroundColor: "#F59E0B20" },
    selectorValBackdate: { color: "#F59E0B" },
    selectorIconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: c.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    selectorIconBoxActive: { backgroundColor: c.primary + "20" },
    selectorText: { flex: 1 },
    selectorHint: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: c.mutedForeground,
      marginBottom: 2,
    },
    selectorVal: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground },
    selectorValEmpty: { color: c.mutedForeground, fontFamily: "Inter_400Regular" },

    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#EF444420",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#EF444440",
    },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", flex: 1 },
    successBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#10B98120",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#10B98140",
    },
    successText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#10B981", flex: 1 },

    startBtn: {
      backgroundColor: c.primary,
      borderRadius: 18,
      height: 60,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginBottom: 24,
    },
    endBtn: {
      backgroundColor: "#EF4444",
      borderRadius: 18,
      height: 60,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginBottom: 24,
    },
    btnDisabled: { backgroundColor: c.secondary },
    btnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#0F1923" },
    btnTextDisabled: { color: c.mutedForeground },

    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border + "60",
    },
    sessionDot: { width: 8, height: 8, borderRadius: 4 },
    sessionDotLive: { backgroundColor: "#10B981" },
    sessionDotDone: { backgroundColor: c.mutedForeground },
    sessionInfo: { flex: 1 },
    sessionName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground },
    sessionMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
    sessionTime: { fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground },

    modalBg: {
      flex: 1,
      backgroundColor: "#00000080",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: c.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "80%",
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 4,
    },
    modalHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground },
    modalCloseBtn: { padding: 4 },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderRadius: 12,
      marginBottom: 4,
    },
    pickerRowSelected: { backgroundColor: c.primary + "20" },
    pickerText: { fontSize: 16, fontFamily: "Inter_500Medium", color: c.foreground },
    pickerTextSelected: { color: c.primary, fontFamily: "Inter_600SemiBold" },
  });
}
